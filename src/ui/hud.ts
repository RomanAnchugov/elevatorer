import { CFG } from '../config';
import type { Cab, CabType, Game, UpgradeKey } from '../types';
import { currentPhase } from '../sim/util';
import { findCab, getPotential } from '../sim/potential';
import { buyShaftWithCab, buySecondCab, buyUpgrade, upgradePrice } from '../sim/economy';
import { audioState, initAudio, sfx, toggleMute } from '../audio';

export interface HudCallbacks {
  restartGame(): void;
}

export interface Hud {
  showCabPanel(cab: Cab): void;
  closePanel(): void;
  openBuyMenu(bay: number, slot: number, sx: number, sy: number): void;
  closeBuyMenu(): void;
  startGame(): void;
  update(game: Game): void;
}

const BEST_KEY = 'elevatorer_best';

export function initHud(getGame: () => Game, cb: HudCallbacks): Hud {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const elMoney = $('st-money');
  const elRep = $('st-rep');
  const elRepFill = document.querySelector('#repbar i') as HTMLElement;
  const elRepVal = $('repval');
  const elDay = $('st-day');
  const elPax = $('st-pax');
  const elFloors = $('st-floors');
  const elHint = $('hint');
  const bPause = $('b-pause');
  const b1 = $('b-1');
  const b2 = $('b-2');
  const bSound = $('b-sound');
  const panel = $('panel');
  const buyMenu = $('buymenu');
  const overlay = $('overlay');

  let panelCabId: number | null = null;
  let buySpot: { bay: number; slot: number } | null = null;
  let lastGame: Game | null = null;
  const typeNames: Record<CabType, string> = { passenger: 'Пассажирский', express: 'Экспресс' };
  const upNames: Record<UpgradeKey, string> = {
    speed: 'Скорость +22%',
    capacity: 'Вместимость +2',
    doors: 'Двери −25%',
  };

  bPause.onclick = () => {
    const g = getGame();
    if (g.introSeen && !g.gameOver) g.speed = g.speed === 0 ? 1 : 0;
    bPause.blur();
  };
  b1.onclick = () => {
    const g = getGame();
    if (g.introSeen && !g.gameOver) g.speed = 1;
    b1.blur();
  };
  b2.onclick = () => {
    const g = getGame();
    if (g.introSeen && !g.gameOver) g.speed = 2;
    b2.blur();
  };
  bSound.onclick = () => {
    initAudio();
    toggleMute();
    bSound.blur();
  };

  // ---------- панель кабины ----------

  function showCabPanel(cab: Cab): void {
    panelCabId = cab.id;
    panel.hidden = false;
    const stops =
      cab.type === 'express'
        ? `этажи ${cab.rangeMin} и ${cab.rangeMax} (только крайние)`
        : `этажи ${cab.rangeMin}–${cab.rangeMax}`;
    const desc =
      cab.type === 'express'
        ? 'Скорость ×2.5, останавливается только на крайних этажах зоны — ски-лобби.'
        : 'Останавливается на любом этаже зоны. Базовый рабочий лифт.';

    let html =
      `<div class="p-head"><span class="dot ${cab.type}"></span> ЛИФТ №${cab.id} · ${typeNames[cab.type]}</div>` +
      `<div class="p-row">Зона: ${stops} <span class="mut">— тяни ▲▼ на фасаде</span></div>` +
      `<div class="p-row mut">${desc}</div>` +
      `<div class="p-row mut">Вместимость ${cab.capacity} · скорость ×${(cab.speed / CFG.cabBaseSpeed).toFixed(2)}</div>`;

    for (const key of ['speed', 'capacity', 'doors'] as UpgradeKey[]) {
      const lvl = cab.upgrades[key];
      const price = upgradePrice(cab, key);
      const pips = '●'.repeat(lvl) + '○'.repeat(3 - lvl);
      html +=
        price != null
          ? `<button data-up="${key}" data-price="${price}">${upNames[key]} — ${price} ₽ · ${pips}</button>`
          : `<button disabled>${upNames[key]} · МАКС</button>`;
    }
    if (cab.shaft.cabs.length < CFG.maxCabsPerShaft) {
      html +=
        `<button data-add="passenger" data-price="${CFG.priceSecondPassenger}">+ Вторая кабина: пассажирская — ${CFG.priceSecondPassenger} ₽` +
        `<small>Второй лифт в общей шахте. Дешевле новой шахты, но кабины мешают друг другу.</small></button>` +
        `<button data-add="express" data-price="${CFG.priceSecondExpress}">+ Вторая кабина: экспресс — ${CFG.priceSecondExpress} ₽</button>`;
    }
    html += `<button data-close>Закрыть</button>`;
    panel.innerHTML = html;

    panel.querySelectorAll<HTMLButtonElement>('button[data-up]').forEach((b) => {
      b.onclick = () => {
        const g = getGame();
        const target = panelCabId != null ? findCab(g, panelCabId) : null;
        if (target && buyUpgrade(g, target, b.dataset.up as UpgradeKey)) showCabPanel(target);
      };
    });
    panel.querySelectorAll<HTMLButtonElement>('button[data-add]').forEach((b) => {
      b.onclick = () => {
        const g = getGame();
        const target = panelCabId != null ? findCab(g, panelCabId) : null;
        if (target && buySecondCab(g, target.shaft, b.dataset.add as CabType)) showCabPanel(target);
      };
    });
    const closeBtn = panel.querySelector<HTMLButtonElement>('button[data-close]');
    if (closeBtn) closeBtn.onclick = () => closePanel();
  }

  function closePanel(): void {
    panelCabId = null;
    panel.hidden = true;
  }

  // ---------- меню покупки ----------

  function openBuyMenu(bay: number, slot: number, sx: number, sy: number): void {
    buySpot = { bay, slot };
    buyMenu.hidden = false;
    buyMenu.innerHTML =
      `<div class="b-head">НОВАЯ ШАХТА · ПОДЪЕЗД ${bay + 1}, СЛОТ ${slot + 1}</div>` +
      `<button data-buy="passenger" data-price="${CFG.priceShaftPassenger}">Пассажирский — ${CFG.priceShaftPassenger} ₽` +
      `<small>Шахта + кабина. Останавливается на всех этажах зоны.</small></button>` +
      `<button data-buy="express" data-price="${CFG.priceShaftExpress}">Экспресс — ${CFG.priceShaftExpress} ₽` +
      `<small>×2.5 скорость, только крайние этажи зоны. Нужен партнёр для пересадок!</small></button>` +
      `<button data-cancel>Отмена</button>`;

    const W = 280;
    buyMenu.style.left = `${Math.min(Math.max(8, sx - W / 2), window.innerWidth - W - 8)}px`;
    buyMenu.style.top = `${Math.max(60, Math.min(sy - 40, window.innerHeight - 260))}px`;

    buyMenu.querySelectorAll<HTMLButtonElement>('button[data-buy]').forEach((b) => {
      b.onclick = () => {
        const g = getGame();
        if (buySpot && buyShaftWithCab(g, buySpot.bay, buySpot.slot, b.dataset.buy as CabType)) {
          closeBuyMenu();
        }
      };
    });
    const cancel = buyMenu.querySelector<HTMLButtonElement>('button[data-cancel]');
    if (cancel) cancel.onclick = () => closeBuyMenu();
  }

  function closeBuyMenu(): void {
    buyMenu.hidden = true;
  }

  // ---------- оверлеи ----------

  function showIntro(): void {
    overlay.hidden = false;
    overlay.innerHTML =
      `<div class="card">` +
      `<h1>ELEVATORER</h1>` +
      `<p class="sub">диспетчерская растущего небоскрёба</p>` +
      `<ul>` +
      `<li>Здание растёт само. Пассажиры платят за этажи; кто не дождался — бьёт по репутации.</li>` +
      `<li>Покупай лифты в пунктирных слотах. Клик по кабине — панель с апгрейдами.</li>` +
      `<li>Тяни ▲▼ у выбранной кабины — её зона. Зонирование — суперсила: экспресс возит между крайними этажами, локальные развозят от него дальше.</li>` +
      `</ul>` +
      `<button id="b-start">НАЧАТЬ СМЕНУ</button>` +
      `<p class="keys">Space — пауза · 2 — ускорение · Esc — снять выбор</p>` +
      `</div>`;
    $('b-start').onclick = () => startGame();
  }

  function showGameOver(game: Game, score: number, best: number): void {
    overlay.hidden = false;
    overlay.innerHTML =
      `<div class="card">` +
      `<h1>СМЕНА ОКОНЧЕНА</h1>` +
      `<p class="sub">репутация упала до нуля</p>` +
      `<div class="score-row">` +
      `<div>дней<b>${game.day}</b></div>` +
      `<div>этажей<b>${game.bays.reduce((a, b) => a + b.floors, 0)}</b></div>` +
      `<div>пассажиров<b>${game.deliveredCount}</b></div>` +
      `<div>злых<b>${game.angryCount}</b></div>` +
      `</div>` +
      `<div class="big">Счёт: ${score}</div>` +
      `<p class="keys">Рекорд: ${best}</p>` +
      `<button id="b-restart">ЗАНОВО</button>` +
      `</div>`;
    $('b-restart').onclick = () => {
      cb.restartGame();
      sfx.start();
    };
  }

  function startGame(): void {
    const g = getGame();
    initAudio();
    sfx.start();
    g.speed = 1;
    g.introSeen = true;
    overlay.hidden = true;
  }

  // ---------- кадровое обновление ----------

  function update(game: Game): void {
    // смена партии (рестарт); на первом кадре просто запоминаем игру
    if (lastGame === null) {
      lastGame = game;
    } else if (game !== lastGame) {
      lastGame = game;
      panelCabId = null;
      panel.hidden = true;
      buyMenu.hidden = true;
      overlay.hidden = true;
    }

    elMoney.textContent = `₽ ${game.money.toLocaleString('ru-RU')}`;
    const rep = Math.round(game.reputation);
    elRepFill.style.width = `${game.reputation}%`;
    elRepVal.textContent = String(rep);
    elRep.classList.toggle('low', game.reputation < 30);
    elDay.textContent = `ДЕНЬ ${game.day} · ${currentPhase(game).name}`;
    elPax.textContent = `Пассажиры: ${game.deliveredCount}`;
    elFloors.textContent = `Этажи: ${game.bays.map((b) => b.floors).join('·')} · подъезды: ${game.bays.length}`;

    bPause.classList.toggle('active', game.speed === 0);
    bPause.textContent = game.speed === 0 ? '▶' : '⏸';
    b1.classList.toggle('active', game.speed === 1);
    b2.classList.toggle('active', game.speed === 2);
    bSound.textContent = audioState.muted ? '🔇' : '🔊';

    // подсказка
    let hint = '';
    let warn = false;
    if (game.introSeen && !game.gameOver) {
      const pairs = new Map<string, { bay: number; from: number; to: number }>();
      for (const p of game.passengers) {
        if (p.state !== 'waiting') continue;
        const pot = getPotential(game, p.bay, p.dest);
        if (!isFinite(pot[p.floor])) {
          pairs.set(`${p.bay}:${p.floor}>${p.dest}`, { bay: p.bay, from: p.floor, to: p.dest });
        }
      }
      if (pairs.size > 0) {
        const multi = game.bays.length > 1;
        const list = [...pairs.values()]
          .slice(0, 3)
          .map((v) => `${multi ? `П${v.bay + 1} ` : ''}${v.from}→${v.to}`)
          .join(', ');
        hint = `⚠ Нет маршрута: ${list}. Пассажиры уходят — перестрой зоны.`;
        warn = true;
      } else {
        hint = 'Пунктир — новый лифт · клик по кабине — панель · тяни ▲▼ — зона · Space — пауза';
      }
    }
    elHint.textContent = hint;
    elHint.classList.toggle('warn', warn);

    // доступность кнопок по деньгам
    const money = game.money;
    panel.querySelectorAll<HTMLButtonElement>('button[data-price]').forEach((b) => {
      b.disabled = money < Number(b.dataset.price);
    });
    buyMenu.querySelectorAll<HTMLButtonElement>('button[data-price]').forEach((b) => {
      b.disabled = money < Number(b.dataset.price);
    });

    // конец игры
    if (game.gameOver && !game.scoreSaved) {
      game.scoreSaved = true;
      const score = game.deliveredCount * 10 + game.bays.reduce((a, b) => a + b.floors, 0) * 100 + (game.day - 1) * 50;
      const best = Math.max(score, Number(localStorage.getItem(BEST_KEY) ?? 0));
      localStorage.setItem(BEST_KEY, String(best));
      showGameOver(game, score, best);
    }
  }

  showIntro();

  return { showCabPanel, closePanel, openBuyMenu, closeBuyMenu, startGame, update };
}
