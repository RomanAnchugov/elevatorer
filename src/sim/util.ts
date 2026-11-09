import { CFG } from '../config';
import type { DayPhase, Game } from '../types';

/** Мировая Y-координата центра этажа n. */
export function floorCenterY(n: number): number {
  return (n - 0.5) * CFG.floorH;
}

/** Ближайший этаж по мировой Y-координате. */
export function yToFloor(y: number): number {
  return Math.max(1, Math.round(y / CFG.floorH + 0.5));
}

/** Кабина стоит точно на этаже (а не зажата посреди шахты)? */
export function atFloorCenter(y: number): boolean {
  return Math.abs(y - floorCenterY(yToFloor(y))) < 1;
}

/** Левая граница подъезда b в мировых координатах. */
export function bayOffsetX(bay: number): number {
  return bay * (CFG.bayWidth + CFG.bayGap);
}

/** Мировая X-координата центра подъезда. */
export function bayCenterX(bay: number): number {
  return bayOffsetX(bay) + CFG.bayWidth / 2;
}

/** Мировая X-координата слота шахты внутри подъезда. */
export function slotX(bay: number, slot: number): number {
  return bayOffsetX(bay) + (CFG.bayWidth * (slot + 1)) / (CFG.shaftCount + 1);
}

/** Полная ширина здания из n подъездов. */
export function buildingWidth(bayCount: number): number {
  return bayCount * CFG.bayWidth + Math.max(0, bayCount - 1) * CFG.bayGap;
}

/** Текущая фаза суток. */
export function currentPhase(game: Game): DayPhase {
  const t = game.dayT;
  return CFG.phases.find((p) => t >= p.from && t < p.to) ?? CFG.phases[CFG.phases.length - 1];
}
