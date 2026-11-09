import { CFG } from '../config';
import type { Game } from '../types';
import { buildingWidth } from '../sim/util';

export interface Cam {
  scale: number;
  ox: number; // экранная позиция мирового x=0
  oy: number; // экранная позиция мирового y=yTop
  yTop: number; // мировая Y, соответствующая верху экрана-отсчёта
}

const PAD_X = 70;
const PAD_BOTTOM = 90;
const TOP_BAR = 64;

export function computeCam(cv: HTMLCanvasElement, game: Game): Cam {
  const H = CFG.floorH;
  const width = buildingWidth(game.bays.length);
  const bx0 = -PAD_X;
  const bx1 = width + PAD_X;
  const by0 = -PAD_BOTTOM; // немного улицы под зданием
  const maxFloors = Math.max(...game.bays.map((b) => b.floors));
  const by1 = maxFloors * H + 110; // и воздуха над самой высокой крышей

  const availW = cv.clientWidth;
  const availH = Math.max(120, cv.clientHeight - TOP_BAR);
  const scale = Math.min(availW / (bx1 - bx0), availH / (by1 - by0));
  const ox = (availW - (bx1 - bx0) * scale) / 2 - bx0 * scale;
  const oy = TOP_BAR + (availH - (by1 - by0) * scale) / 2 + by1 * scale;
  return { scale, ox, oy, yTop: by1 };
}

/** Мир → экран (css-пиксели). Экранная Y растёт вниз. */
export function w2s(cam: Cam, x: number, y: number): { x: number; y: number } {
  return { x: cam.ox + x * cam.scale, y: cam.oy - y * cam.scale };
}

/** Экран → мир. */
export function s2w(cam: Cam, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - cam.ox) / cam.scale, y: (cam.oy - sy) / cam.scale };
}
