import { CFG } from '../config';
import type { Bay, DayPhase, Game, Passenger } from '../types';
import { currentPhase } from './util';

/**
 * Генерация пассажиров по фазам дня:
 * утро — все вверх с лобби, вечер — все вниз к лобби, днём — каша и посетители.
 * Интенсивность пропорциональна этажности подъезда; спрос свежевъехавших
 * подъездов разгоняется постепенно (bayRampDays), чтобы не заваливать игрока.
 */

/** Сколько «полноценного» спроса даёт подъезд (0..1) в зависимости от возраста. */
function bayWeight(game: Game, bay: Bay): number {
  if (bay.index === 0) return 1; // стартовый подъезд живёт с полным спросом
  const age = game.day - bay.bornDay + game.dayT;
  return Math.min(1, age / CFG.bayRampDays);
}

export function spawnTick(game: Game, dt: number): void {
  const ph = currentPhase(game);
  const ramp = Math.min(1.6, 1 + (game.day - 1) * 0.04);
  const rates = game.bays.map(
    (bay) => ph.k * bay.floors * ramp * bayWeight(game, bay),
  );
  const totalRate = rates.reduce((a, b) => a + b, 0);
  game.spawnAcc += totalRate * dt;
  while (game.spawnAcc >= 1) {
    game.spawnAcc -= 1;
    const bay = pickBay(rates, totalRate);
    if (bay >= 0) spawnOne(game, ph, bay);
  }
}

function pickBay(rates: number[], total: number): number {
  if (total <= 0) return -1;
  let roll = Math.random() * total;
  for (let i = 0; i < rates.length; i++) {
    roll -= rates[i];
    if (roll <= 0) return i;
  }
  return rates.length - 1;
}

function rndFloor(n: number): number {
  return 1 + Math.floor(Math.random() * n);
}

function spawnOne(game: Game, ph: DayPhase, bay: number): void {
  const n = game.bays[bay].floors;
  let origin = 1;
  let dest = 1;

  if (ph.kind === 'up') {
    origin = 1;
    do {
      dest = rndFloor(n);
    } while (dest === 1 && n > 1);
  } else if (ph.kind === 'down') {
    origin = rndFloor(n);
    dest = 1;
  } else {
    if (Math.random() < 0.5) {
      origin = 1;
      dest = rndFloor(n);
    } else {
      origin = rndFloor(n);
      dest = rndFloor(n);
      if (dest === origin) dest = ((origin + Math.floor(n / 2)) % n) + 1;
    }
  }
  if (origin === dest) return;

  const patienceMax = CFG.patienceSeconds * (0.85 + Math.random() * 0.3);
  const p: Passenger = {
    id: game.nextId++,
    bay,
    origin,
    dest,
    floor: origin,
    state: 'waiting',
    rideExit: null,
    inCab: null,
    patience: patienceMax,
    patienceMax,
    bobT: Math.random() * 6,
  };
  game.passengers.push(p);
}
