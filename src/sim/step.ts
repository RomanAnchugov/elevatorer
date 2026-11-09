import { CFG } from '../config';
import type { Game } from '../types';
import { allCabs } from './potential';
import { markRoutesDirty, updateCab } from './cab';
import { spawnTick } from './spawn';
import { checkBayArrivals } from './building';
import { angerLeave, addEffect } from './economy';
import { bayCenterX, floorCenterY } from './util';
import { sfx } from '../audio';

/** Один фиксированный шаг симуляции. */
export function step(game: Game, dt: number): void {
  if (game.gameOver) return;

  game.time += dt;
  game.dayT += dt / CFG.daySeconds;
  while (game.dayT >= 1) {
    game.dayT -= 1;
    newDay(game);
  }

  if (game.routesDirty) markRoutesDirty(game);

  spawnTick(game, dt);
  for (const cab of allCabs(game)) updateCab(game, cab, dt);
  patienceTick(game, dt);
  effectsTick(game, dt);
}

function newDay(game: Game): void {
  game.day++;
  // этажность растёт по плану каждого подъезда — высоты всегда разные
  for (const bay of game.bays) {
    const plan = CFG.bayPlans[bay.index] ?? CFG.bayPlans[CFG.bayPlans.length - 1];
    if (bay.floors >= plan.cap) continue;
    bay.floorsAcc += plan.rate;
    while (bay.floorsAcc >= 1 && bay.floors < plan.cap) {
      bay.floorsAcc -= 1;
      bay.floors++;
      addEffect(game, {
        kind: 'ring',
        x: bayCenterX(bay.index),
        y: floorCenterY(bay.floors),
        text: `ЭТАЖ ${bay.floors}`,
        t: 0,
        life: 1.8,
      });
      sfx.grow();
    }
  }
  checkBayArrivals(game);
}

function patienceTick(game: Game, dt: number): void {
  let hasGone = false;
  for (const p of game.passengers) {
    if (p.state !== 'waiting') continue;
    p.patience -= dt;
    if (p.patience <= 0) {
      angerLeave(game, p);
      hasGone = true;
    }
  }
  if (hasGone) game.passengers = game.passengers.filter((p) => p.state !== 'gone');
  // «done» чистим тут же, чтобы список не пух
  if (game.passengers.some((p) => p.state === 'done')) {
    game.passengers = game.passengers.filter((p) => p.state !== 'done');
  }
}

function effectsTick(game: Game, dt: number): void {
  for (const e of game.effects) e.t += dt;
  game.effects = game.effects.filter((e) => e.t < e.life);
}
