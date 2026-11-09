import { CFG } from '../config';
import type { Game } from '../types';
import { bayCenterX, floorCenterY } from './util';
import { addEffect } from './economy';
import { sfx } from '../audio';

/**
 * Въезд нового подъезда: невысокая колонна (CFG.newBayFloors),
 * спрос разгоняется постепенно (см. bayWeight в spawn.ts).
 */
export function addBay(game: Game): void {
  if (game.bays.length >= CFG.bayPlans.length) return;
  const index = game.bays.length;
  game.bays.push({
    index,
    floors: CFG.newBayFloors,
    floorsAcc: 0,
    bornDay: game.day,
    shafts: new Array(CFG.shaftCount).fill(null),
  });
  addEffect(game, {
    kind: 'ring',
    x: bayCenterX(index),
    y: floorCenterY(CFG.newBayFloors),
    text: `ПОДЪЕЗД ${index + 1}`,
    t: 0,
    life: 2,
  });
  sfx.buy();
}

/** Вехи: в такие дни въезжает следующий подъезд. */
export function checkBayArrivals(game: Game): void {
  const want = CFG.bayAtDays.filter((d) => game.day >= d).length + 1;
  while (game.bays.length < Math.min(want, CFG.bayPlans.length)) addBay(game);
}
