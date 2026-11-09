import { CFG } from '../config';
import type { Game, Passenger } from '../types';
import type { Cam } from './camera';
import { w2s } from './camera';
import { getPotential } from '../sim/potential';
import { bayOffsetX, buildingWidth, floorCenterY, slotX } from '../sim/util';

export interface UIState {
  cam: Cam;
  hoverSlot: { bay: number; slot: number } | null;
  dragging: { cabId: number; which: 'min' | 'max' } | null;
  mouse: { x: number; y: number };
}

const C = CFG.colors;

export function draw(
  ctx: CanvasRenderingContext2D,
  cv: HTMLCanvasElement,
  cam: Cam,
  game: Game,
  ui: UIState,
): void {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const W = cv.clientWidth;
  const H = cv.clientHeight;
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);

  const S = cam.scale;
  const X = (x: number) => w2s(cam, x, 0).x;
  const Y = (y: number) => w2s(cam, 0, y).y;
  const width = buildingWidth(game.bays.length);

  // ---- улица ----
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 3;
  line(ctx, X(-46), Y(0), X(width + 46), Y(0));

  // ---- корпуса подъездов: у каждого своя высота ----
  for (const bay of game.bays) {
    const ox = bayOffsetX(bay.index);
    const h = bay.floors * CFG.floorH;
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2;
    ctx.strokeRect(X(ox), Y(h), CFG.bayWidth * S, h * S);
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    for (let f = 1; f < bay.floors; f++) {
      line(ctx, X(ox), Y(f * CFG.floorH), X(ox + CFG.bayWidth), Y(f * CFG.floorH));
    }
  }

  // ---- нумерация этажей (у левого края каждого подъезда) ----
  ctx.font = '11px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.faint;
  for (const bay of game.bays) {
    const nx = bayOffsetX(bay.index) - 12;
    for (let f = 1; f <= bay.floors; f++) {
      ctx.fillText(String(f), X(nx), Y((f - 0.5) * CFG.floorH));
    }
  }

  // ---- слоты шахт ----
  for (const bay of game.bays) {
    for (let slot = 0; slot < CFG.shaftCount; slot++) {
      const shaft = bay.shafts[slot];
      const sx = slotX(bay.index, slot);
      const hover = ui.hoverSlot?.bay === bay.index && ui.hoverSlot?.slot === slot;
      const topY = bay.floors * CFG.floorH;
      if (shaft) {
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 2;
        line(ctx, X(sx), Y(0), X(sx), Y(topY));
      } else {
        ctx.strokeStyle = hover ? C.ink : C.faint;
        ctx.lineWidth = hover ? 2 : 1.5;
        ctx.setLineDash([5, 6]);
        line(ctx, X(sx), Y(0), X(sx), Y(topY));
        ctx.setLineDash([]);
      }
    }
  }

  // ---- зона выбранной кабины: подсветка (ручки рисуются поверх кабин ниже) ----
  const sel = game.selectedCabId != null
    ? game.bays
        .flatMap((b) => b.shafts)
        .flatMap((s) => s?.cabs ?? [])
        .find((c) => c.id === game.selectedCabId) ?? null
    : null;
  if (sel) {
    const bx = sel.shaft.x;
    const bandTop = sel.rangeMax * CFG.floorH;
    const bandH = (sel.rangeMax - sel.rangeMin + 1) * CFG.floorH;
    ctx.fillStyle = hexAlpha(C.accent, 0.07);
    ctx.fillRect(X(bx - 24), Y(bandTop), 48 * S, bandH * S);
    // подчёркнутые этажи остановок (у экспресса — только крайние)
    const stops = sel.type === 'express' ? [sel.rangeMin, sel.rangeMax] : [];
    ctx.strokeStyle = hexAlpha(C.accent, 0.75);
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    for (const f of stops) {
      const fy = (f - 0.5) * CFG.floorH;
      line(ctx, X(bx - 24), Y(fy), X(bx + 24), Y(fy));
    }
    ctx.setLineDash([]);
  }

  // ---- кабины ----
  for (const bay of game.bays) {
    for (const shaft of bay.shafts) {
      if (!shaft) continue;
      for (const cab of shaft.cabs) drawCab(ctx, cam, cab, sel?.id === cab.id);
    }
  }

  // ---- ручки зоны выбранной кабины (поверх кабин) ----
  if (sel) {
    const bx = sel.shaft.x;
    for (const which of ['min', 'max'] as const) {
      const f = which === 'min' ? sel.rangeMin : sel.rangeMax;
      const p = w2s(cam, bx, floorCenterY(f));
      const active = ui.dragging?.cabId === sel.id && ui.dragging.which === which;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = active ? C.accent : C.paper;
      ctx.fill();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = active ? C.paper : C.ink;
      ctx.font = 'bold 8px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('▲▼', p.x, p.y + 0.5);
    }
  }

  // ---- ожидающие пассажиры ----
  drawWaiting(ctx, cam, game);

  // ---- эффекты ----
  drawEffects(ctx, cam, game);

  // ---- пауза ----
  if (game.speed === 0 && game.introSeen && !game.gameOver) {
    ctx.fillStyle = hexAlpha(C.ink, 0.5);
    ctx.font = 'bold 30px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('П А У З А', W / 2, H / 2);
  }
}

function drawCab(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cab: { shaft: { x: number }; y: number; type: string; passengers: Passenger[]; capacity: number; state: string },
  selected: boolean,
): void {
  const S = cam.scale;
  const w = CFG.cabW * S;
  const h = CFG.cabH * S;
  const p = w2s(cam, cab.shaft.x, cab.y);
  const x = p.x - w / 2;
  const y = p.y - h / 2;

  const express = cab.type === 'express';
  ctx.fillStyle = express ? C.accent : '#FFFFFF';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);

  if (selected) {
    ctx.strokeStyle = C.accent;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(x - 4, y - 4, w + 8, h + 8);
    ctx.setLineDash([]);
  }

  if (cab.state === 'doors') {
    ctx.fillStyle = express ? C.paper : C.accent;
    ctx.fillRect(x + 4, y + h - 3, w - 8, 2);
  }

  // пассажиры внутри: сетка точек
  const n = cab.passengers.length;
  const dotColor = express ? C.paper : C.ink;
  ctx.fillStyle = dotColor;
  const cols = 3;
  const rows = Math.ceil(Math.max(n, 1) / cols);
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const dx = (col - (cols - 1) / 2) * 9 * S;
    const dy = (row - (rows - 1) / 2) * 11 * S;
    ctx.beginPath();
    ctx.arc(p.x + dx, p.y + dy, 3 * S, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWaiting(ctx: CanvasRenderingContext2D, cam: Cam, game: Game): void {
  const S = cam.scale;
  const waiting = game.passengers.filter((p) => p.state === 'waiting');

  ctx.font = '9px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const p of waiting) {
    const bay = game.bays[p.bay];
    const slabY = (p.floor - 1) * CFG.floorH;
    // стабильная позиция по id: люди рассыпаны по этажу, а не стоят в очередь
    // к среднему лифту
    const pad = 28;
    const spanX = CFG.bayWidth - pad * 2;
    const rx = ((p.id * 7919) % 997) / 997; // 0..1, стабильное по пассажиру
    let wx = bayOffsetX(bay.index) + pad + rx * spanX;
    // не даём точке налезать на линию шахты
    for (let slot = 0; slot < CFG.shaftCount; slot++) {
      const sx = slotX(bay.index, slot);
      if (Math.abs(wx - sx) < 11) wx = sx + (wx < sx ? -11 : 11);
    }
    const row = p.id % 3; // три «полосы» стояния, чтобы точки не слипались
    const bob = Math.sin(game.time * 2.2 + p.bobT) * 1.4;
    const pt = w2s(cam, wx, slabY + 6 + (row - 1) * 5 + bob);

    // терпение: кольцо-таймер
    const frac = Math.max(0, p.patience / p.patienceMax);
    if (frac < 0.72) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 8 * S, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.strokeStyle = frac < 0.35 ? C.red : C.ink;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    const pot = getPotential(game, p.bay, p.dest);
    const unreachable = !isFinite(pot[p.floor]);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4.5 * S, 0, Math.PI * 2);
    ctx.fillStyle = unreachable ? C.red : C.ink;
    ctx.fill();

    ctx.fillStyle = unreachable ? C.red : hexAlpha(C.ink, 0.72);
    ctx.fillText(String(p.dest), pt.x, pt.y - 14 * S);
  }
}

function drawEffects(ctx: CanvasRenderingContext2D, cam: Cam, game: Game): void {
  const S = cam.scale;
  for (const e of game.effects) {
    const k = e.t / e.life;
    const alpha = 1 - k;
    const pt = w2s(cam, e.x, e.y);
    ctx.globalAlpha = alpha;
    if (e.kind === 'text') {
      ctx.fillStyle = e.color ?? C.ink;
      ctx.font = 'bold 13px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(e.text ?? '', pt.x, pt.y - k * 34 * S);
    } else if (e.kind === 'ring') {
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, (10 + 60 * k) * S, 0, Math.PI * 2);
      ctx.stroke();
      if (e.text) {
        ctx.fillStyle = C.ink;
        ctx.font = 'bold 13px ui-monospace, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(e.text, pt.x, pt.y - (24 + 30 * k) * S);
      }
    } else {
      ctx.strokeStyle = C.red;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, (4 + 24 * k) * S, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** #RRGGBB + альфа → rgba(). */
function hexAlpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}
