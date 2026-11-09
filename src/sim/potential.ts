import type { Cab, Game, Passenger } from '../types';

export function allCabs(game: Game): Cab[] {
  const out: Cab[] = [];
  for (const bay of game.bays) for (const s of bay.shafts) if (s) out.push(...s.cabs);
  return out;
}

export function findCab(game: Game, id: number): Cab | null {
  for (const cab of allCabs(game)) if (cab.id === id) return cab;
  return null;
}

/**
 * Какие этажы кабина обслуживает как «перевозчик»:
 * пассажирский — любой в диапазоне, экспресс — только крайние.
 */
export function serviceSet(cab: Cab): number[] {
  if (cab.type === 'express') return [cab.rangeMin, cab.rangeMax];
  const out: number[] = [];
  for (let f = cab.rangeMin; f <= cab.rangeMax; f++) out.push(f);
  return out;
}

/**
 * Поле потенциала подъезда: pot[f] = минимальное число поездок (пересадок)
 * от этажа f до dest, если пользоваться только лифтами этого подъезда.
 * Infinity — маршрут отрезан. Граф неориентированный: кабина возит f↔g
 * в обе стороны.
 */
const potCache = new Map<string, number[]>(); // ключ `${bay}:${floors}:${dest}`

export function invalidatePotentials(): void {
  potCache.clear();
}

export function getPotential(game: Game, bay: number, dest: number): number[] {
  const bayObj = game.bays[bay];
  const key = `${bay}:${bayObj ? bayObj.floors : 0}:${dest}`;
  const hit = potCache.get(key);
  if (hit) return hit;

  const n = bayObj ? bayObj.floors : 0;
  const pot: number[] = new Array(n + 1).fill(Infinity);
  if (dest >= 1 && dest <= n) {
    pot[dest] = 0;
    const q: number[] = [dest];
    const bayObj = game.bays[bay];
    const cabs: Cab[] = bayObj ? bayObj.shafts.flatMap((s) => s?.cabs ?? []) : [];
    while (q.length) {
      const f = q.shift()!;
      for (const cab of cabs) {
        const s = serviceSet(cab);
        if (!s.includes(f)) continue;
        for (const g of s) {
          if (pot[g] > pot[f] + 1) {
            pot[g] = pot[f] + 1;
            q.push(g);
          }
        }
      }
    }
  }
  potCache.set(key, pot);
  return pot;
}

/**
 * Лучший этаж выхода из кабины для пассажира p, садящегося на fromFloor:
 * минимум пересадок, при равенстве — ближайший. null, если поездка не
 * улучшает маршрут или кабина из чужого подъезда.
 */
export function bestExit(game: Game, p: Passenger, cab: Cab, fromFloor: number): number | null {
  if (cab.shaft.bay !== p.bay) return null;
  const pot = getPotential(game, p.bay, p.dest);
  const cur = pot[fromFloor];
  if (!isFinite(cur)) return null;

  let best: number | null = null;
  let bestPot = Infinity;
  let bestDist = Infinity;
  for (const g of serviceSet(cab)) {
    if (g === fromFloor) continue;
    const v = pot[g];
    const d = Math.abs(g - fromFloor);
    if (v < cur && (v < bestPot || (v === bestPot && d < bestDist))) {
      best = g;
      bestPot = v;
      bestDist = d;
    }
  }
  return best;
}
