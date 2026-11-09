import { CFG } from './config';
import type { Cab, Game } from './types';
import { allCabs, findCab } from './sim/potential';
import { floorCenterY, slotX } from './sim/util';
import { markRoutesDirty } from './sim/cab';
import type { UIState } from './render/draw';
import { s2w, w2s } from './render/camera';
import type { Hud } from './ui/hud';
import { initAudio, sfx, toggleMute } from './audio';

export function initInput(cv: HTMLCanvasElement, getGame: () => Game, ui: UIState, hud: Hud): void {
  let drag: { cab: Cab; which: 'min' | 'max' } | null = null;

  const screenPos = (e: PointerEvent) => {
    const r = cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  cv.addEventListener('pointerdown', (e) => {
    const g = getGame();
    if (g.gameOver || !g.introSeen) return;
    const sp = screenPos(e);
    ui.mouse = sp;
    const w = s2w(ui.cam, sp.x, sp.y);

    // 1) ручки зоны выбранной кабины
    const sel = g.selectedCabId != null ? findCab(g, g.selectedCabId) : null;
    if (sel) {
      for (const which of ['min', 'max'] as const) {
        const f = which === 'min' ? sel.rangeMin : sel.rangeMax;
        const hp = w2s(ui.cam, sel.shaft.x, floorCenterY(f));
        if (Math.hypot(hp.x - sp.x, hp.y - sp.y) <= 13) {
          drag = { cab: sel, which };
          ui.dragging = { cabId: sel.id, which };
          cv.setPointerCapture(e.pointerId);
          return;
        }
      }
    }

    // 2) клик по кабине
    for (const cab of allCabs(g)) {
      const cp = w2s(ui.cam, cab.shaft.x, cab.y);
      const hw = (CFG.cabW / 2 + 5) * ui.cam.scale;
      const hh = (CFG.cabH / 2 + 5) * ui.cam.scale;
      if (Math.abs(cp.x - sp.x) <= hw && Math.abs(cp.y - sp.y) <= hh) {
        g.selectedCabId = cab.id;
        hud.showCabPanel(cab);
        hud.closeBuyMenu();
        return;
      }
    }

    // 3) клик по колонке слота (в любом подъезде, зона — до его крыши)
    for (const bay of g.bays) {
      let hit: number | null = null;
      const topY = bay.floors * CFG.floorH + 40;
      for (let slot = 0; slot < CFG.shaftCount; slot++) {
        const sx = slotX(bay.index, slot);
        if (Math.abs(w.x - sx) <= 24 && w.y > -40 && w.y < topY) {
          hit = slot;
          break;
        }
      }
      if (hit != null) {
        const shaft = bay.shafts[hit];
        if (!shaft) {
          const anchor = w2s(ui.cam, slotX(bay.index, hit), bay.floors * CFG.floorH * 0.45);
          hud.openBuyMenu(bay.index, hit, anchor.x, anchor.y);
        } else {
          const nearest = shaft.cabs.reduce((a, b) =>
            Math.abs(a.y - w.y) <= Math.abs(b.y - w.y) ? a : b,
          );
          g.selectedCabId = nearest.id;
          hud.showCabPanel(nearest);
          hud.closeBuyMenu();
        }
        return;
      }
    }

    // 4) пустое место — снять выбор
    g.selectedCabId = null;
    hud.closePanel();
    hud.closeBuyMenu();
  });

  cv.addEventListener('pointermove', (e) => {
    const g = getGame();
    const sp = screenPos(e);
    ui.mouse = sp;
    const w = s2w(ui.cam, sp.x, sp.y);

    // перетаскивание зоны
    if (drag) {
      const bayFloors = g.bays[drag.cab.shaft.bay].floors;
      const f = Math.max(1, Math.min(bayFloors, Math.round(w.y / CFG.floorH + 0.5)));
      const cab = drag.cab;
      if (drag.which === 'min') {
        const nm = Math.min(f, cab.rangeMax - 1);
        if (nm >= 1 && nm !== cab.rangeMin) {
          cab.rangeMin = nm;
          markRoutesDirty(g);
          sfx.tick();
          hud.showCabPanel(cab);
        }
      } else {
        const nx = Math.max(f, cab.rangeMin + 1);
        if (nx <= bayFloors && nx !== cab.rangeMax) {
          cab.rangeMax = nx;
          markRoutesDirty(g);
          sfx.tick();
          hud.showCabPanel(cab);
        }
      }
      cv.style.cursor = 'grabbing';
      return;
    }

    // hover: слоты, кабины, ручки
    let pointer = false;
    ui.hoverSlot = null;
    const sel = g.selectedCabId != null ? findCab(g, g.selectedCabId) : null;
    if (sel) {
      for (const which of ['min', 'max'] as const) {
        const f = which === 'min' ? sel.rangeMin : sel.rangeMax;
        const hp = w2s(ui.cam, sel.shaft.x, floorCenterY(f));
        if (Math.hypot(hp.x - sp.x, hp.y - sp.y) <= 13) pointer = true;
      }
    }
    for (const cab of allCabs(g)) {
      const cp = w2s(ui.cam, cab.shaft.x, cab.y);
      if (
        Math.abs(cp.x - sp.x) <= (CFG.cabW / 2 + 5) * ui.cam.scale &&
        Math.abs(cp.y - sp.y) <= (CFG.cabH / 2 + 5) * ui.cam.scale
      ) {
        pointer = true;
        break;
      }
    }
    if (!pointer) {
      for (const bay of g.bays) {
        for (let slot = 0; slot < CFG.shaftCount; slot++) {
          if (bay.shafts[slot]) continue;
          const sx = slotX(bay.index, slot);
          if (Math.abs(w.x - sx) <= 24 && w.y > -40 && w.y < bay.floors * CFG.floorH + 40) {
            ui.hoverSlot = { bay: bay.index, slot };
            pointer = true;
            break;
          }
        }
        if (pointer) break;
      }
    }
    cv.style.cursor = pointer ? 'pointer' : 'default';
  });

  window.addEventListener('pointerup', () => {
    drag = null;
    ui.dragging = null;
  });

  window.addEventListener('keydown', (e) => {
    const g = getGame();
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      if (!g.introSeen || g.gameOver) return;
      g.speed = g.speed === 0 ? 1 : 0;
    } else if (e.key === '1' && !e.repeat) {
      if (g.introSeen && !g.gameOver) g.speed = 1;
    } else if (e.key === '2' && !e.repeat) {
      if (g.introSeen && !g.gameOver) g.speed = 2;
    } else if (e.key === 'Escape') {
      g.selectedCabId = null;
      hud.closePanel();
      hud.closeBuyMenu();
    } else if (e.key === 'm' || e.key === 'ь') {
      if (!e.repeat) {
        initAudio();
        toggleMute();
      }
    }
  });
}
