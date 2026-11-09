import { CFG } from '../config';
import type { Cab, Game, Passenger } from '../types';
import { allCabs, bestExit, serviceSet } from './potential';
import { invalidatePotentials } from './potential';
import { deliver, angerLeave } from './economy';
import { atFloorCenter, floorCenterY, yToFloor } from './util';
import { sfx } from '../audio';
/**
 * Диспетчер классического типа (SCAN / «лифтовой алгоритм»):
 * кабина собирает всех по направлению движения в своей зоне, затем разворачивается.
 * Пассажиры садятся только на поездку, уменьшающую число пересадок до цели
 * (см. bestExit), и только если она совпадает с направлением кабины.
 */

function waitingAt(game: Game, cab: Cab, floor: number): Passenger[] {
  return game.passengers.filter(
    (p) => p.state === 'waiting' && p.floor === floor && p.bay === cab.shaft.bay,
  );
}

/** Вызвать после любого изменения зон/этажей: пересчитать маршруты и планы. */
export function markRoutesDirty(game: Game): void {
  invalidatePotentials();
  refreshRidingPlans(game);
  game.routesDirty = false;
}

/** Пересчитать планы выхода у пассажиров в кабинах (зоны могли поменяться). */
export function refreshRidingPlans(game: Game): void {
  for (const cab of allCabs(game)) {
    for (const p of cab.passengers) {
      const f = yToFloor(cab.y);
      const g = bestExit(game, p, cab, f);
      if (g != null) {
        p.rideExit = g;
      } else {
        // улучшений нет (зону порезали) — высадим на ближайшем к цели этаже зоны
        const set = serviceSet(cab);
        p.rideExit = set.reduce((a, b) =>
          Math.abs(a - p.dest) <= Math.abs(b - p.dest) ? a : b,
        );
      }
    }
    // кабина оказалась вне зоны (после перенастройки) — вернуться и зажать цель
    cab.targetFloor = Math.min(cab.rangeMax, Math.max(cab.rangeMin, cab.targetFloor));
    const cf = yToFloor(cab.y);
    if (cf < cab.rangeMin || cf > cab.rangeMax) {
      const t = cf < cab.rangeMin ? cab.rangeMin : cab.rangeMax;
      cab.targetFloor = t;
      cab.direction = t > cf ? 1 : -1;
      if (cab.state !== 'doors') {
        cab.state = 'moving';
        cab.blockT = 0;
      }
    }
  }
}

export function updateCab(game: Game, cab: Cab, dt: number): void {
  const sibling = cab.shaft.cabs.find((c) => c !== cab) ?? null;

  if (cab.state === 'doors') {
    cab.doorT -= dt;
    if (cab.doorT <= 0) decideNext(game, cab);
    return;
  }
  if (cab.state === 'idle') {
    decideNext(game, cab);
    return;
  }

  // движение / блокировка
  const targetY = floorCenterY(cab.targetFloor);
  let safeY = targetY;
  let blocked = false;
  if (sibling && cab.blockT < CFG.deadlockSeconds) {
    const gap = CFG.cabH + CFG.cabGap;
    if (sibling.y > cab.y && targetY > sibling.y - gap) {
      safeY = sibling.y - gap;
      blocked = safeY - cab.y > 0.5;
    } else if (sibling.y < cab.y && targetY < sibling.y + gap) {
      safeY = sibling.y + gap;
      blocked = cab.y - safeY > 0.5;
    }
  }
  if (blocked) {
    cab.state = 'blocked';
    cab.blockT += dt;
    return;
  }

  const dist = Math.abs(safeY - cab.y);
  const step = cab.speed * dt;
  cab.state = 'moving';
  cab.blockT = 0;
  if (dist <= step) {
    cab.y = safeY;
    if (atFloorCenter(cab.y)) {
      openDoorsAndExchange(game, cab);
    } else {
      // доехали до «потолка» за сестрой — ждём, пока она уйдёт
      cab.state = 'blocked';
      cab.blockT += dt;
    }
  } else {
    cab.y += Math.sign(safeY - cab.y) * step;
  }
}

function board(game: Game, cab: Cab, p: Passenger, exitFloor: number): void {
  p.state = 'riding';
  p.inCab = cab;
  p.rideExit = exitFloor;
  cab.passengers.push(p);
  sfx.pickup();
}

function alight(game: Game, cab: Cab, p: Passenger, floor: number): void {
  cab.passengers = cab.passengers.filter((q) => q !== p);
  p.inCab = null;
  p.rideExit = null;
  p.floor = floor;
  if (floor === p.dest) {
    deliver(game, p, cab);
  } else {
    p.state = 'waiting'; // пересадка
  }
}

/** Прибытие на этаж: двери, высадка, выбор направления, посадка. */
function openDoorsAndExchange(game: Game, cab: Cab): void {
  cab.state = 'doors';
  cab.doorT = cab.doorTime;
  const f = yToFloor(cab.y);

  // 1. высадка
  for (const p of cab.passengers.filter((q) => q.rideExit === f)) {
    alight(game, cab, p, f);
  }

  // 2. кто хочет сесть (самые нетерпеливые — первыми)
  const wants: { p: Passenger; g: number }[] = [];
  for (const p of waitingAt(game, cab, f).sort((a, b) => a.patience - b.patience)) {
    const g = bestExit(game, p, cab, f);
    if (g != null) wants.push({ p, g });
  }

  // 3. направление: сначала выходы на борту, потом посадка
  const up = cab.passengers.some((p) => p.rideExit! > f) || wants.some((w) => w.g > f);
  const down = cab.passengers.some((p) => p.rideExit! < f) || wants.some((w) => w.g < f);
  if (up && !down) cab.direction = 1;
  else if (down && !up) cab.direction = -1;
  else if (up && down) {
    if (cab.direction === 0) cab.direction = 1; // тай-брейк: вверх
  } else if (cab.passengers.length === 0) {
    cab.direction = 0;
  }

  // 4. посадка в согласии с направлением
  let boarded = 0;
  for (const w of wants) {
    if (cab.passengers.length >= cab.capacity) break;
    if (Math.sign(w.g - f) !== cab.direction) continue;
    board(game, cab, w.p, w.g);
    boarded++;
  }
  cab.doorT += boarded * CFG.boardTimePerPax;
}

/** Выбор следующей цели (SCAN) или отдых. */
function decideNext(game: Game, cab: Cab): void {
  const f = yToFloor(cab.y);

  // кабина вне своей зоны — вернуться в зону
  if (f < cab.rangeMin || f > cab.rangeMax) {
    const t = f < cab.rangeMin ? cab.rangeMin : cab.rangeMax;
    cab.targetFloor = t;
    cab.direction = t > f ? 1 : -1;
    cab.state = 'moving';
    cab.blockT = 0;
    return;
  }

  // кандидаты: этажи выходов пассажиров + этажи вызовов, которые эта кабина улучшит
  const cand = new Map<number, -1 | 1>();
  for (const p of cab.passengers) {
    const d = Math.sign(p.rideExit! - f);
    if (d !== 0) cand.set(p.rideExit!, d as -1 | 1);
  }
  for (const p of game.passengers) {
    if (p.state !== 'waiting') continue;
    if (p.bay !== cab.shaft.bay) continue;
    if (p.floor < cab.rangeMin || p.floor > cab.rangeMax) continue;
    if (cab.type === 'express' && p.floor !== cab.rangeMin && p.floor !== cab.rangeMax) continue;
    const g = bestExit(game, p, cab, p.floor);
    if (g == null) continue;
    const d = Math.sign(g - p.floor);
    if (d === 0) continue;
    cand.set(p.floor, d as -1 | 1);
  }

  if (cand.size === 0) {
    cab.direction = 0;
    cab.targetFloor = f;
    cab.state = 'idle';
    return;
  }

  // вызов на текущем этаже — открыть двери здесь, но только если есть смысл:
  // кто-то выходит или есть свободные места (иначе полная кабина запрётся на
  // этаже в цикле «открыл двери — сесть некому — снова вызов»)
  if (cand.has(f)) {
    const exitsHere = cab.passengers.some((p) => p.rideExit === f);
    const hasRoom = cab.passengers.length < cab.capacity;
    if (exitsHere || hasRoom) {
      cab.direction = cand.get(f)!;
      openDoorsAndExchange(game, cab);
      return;
    }
    cand.delete(f); // не наша остановка — остальные вызовы ждут после высадки
  }

  const floors = [...cand.keys()];
  const nearest = (arr: number[]) =>
    arr.reduce((a, b) => (Math.abs(a - f) <= Math.abs(b - f) ? a : b));

  const go = (t: number) => {
    cab.targetFloor = t;
    cab.direction = (t > f ? 1 : -1) as -1 | 1;
    cab.state = 'moving';
    cab.blockT = 0;
  };

  if (cab.direction === 1) {
    const above = floors.filter((x) => x > f);
    if (above.length) return go(nearest(above));
    cab.direction = -1;
  }
  if (cab.direction === -1) {
    const below = floors.filter((x) => x < f);
    if (below.length) return go(nearest(below));
    cab.direction = 1;
  }
  go(nearest(floors));
}
