import { CFG } from '../config';
import type { Cab, CabType, Effect, Game, Passenger, Shaft, UpgradeKey } from '../types';
import { bayCenterX, currentPhase, floorCenterY, slotX } from './util';
import { sfx } from '../audio';

export function addEffect(game: Game, e: Effect): void {
  game.effects.push(e);
  if (game.effects.length > 60) game.effects.shift();
}

export function recalcCab(cab: Cab): void {
  const speedMult = cab.type === 'express' ? CFG.expressSpeedMult : 1;
  cab.speed = CFG.cabBaseSpeed * speedMult * (1 + CFG.upSpeed.speedAdd * cab.upgrades.speed);
  const baseCap = cab.type === 'express' ? CFG.expressCapacity : CFG.passengerCapacity;
  cab.capacity = baseCap + CFG.upCapacity.capAdd * cab.upgrades.capacity;
  cab.doorTime = CFG.doorBaseTime * Math.pow(CFG.upDoors.doorMult, cab.upgrades.doors);
}

export function makeCab(game: Game, type: CabType, shaft: Shaft, indexInShaft: number): Cab {
  const cab: Cab = {
    id: game.cabSeq++,
    type,
    shaft,
    indexInShaft,
    y: floorCenterY(1),
    rangeMin: 1,
    rangeMax: game.bays[shaft.bay].floors,
    direction: 0,
    state: 'idle',
    doorT: 0,
    blockT: 0,
    targetFloor: 1,
    passengers: [],
    upgrades: { speed: 0, capacity: 0, doors: 0 },
    speed: 0,
    capacity: 0,
    doorTime: CFG.doorBaseTime,
  };
  recalcCab(cab);
  return cab;
}

// ---------- события ----------

export function deliver(game: Game, p: Passenger, cab: Cab): void {
  const dist = Math.abs(p.dest - p.origin);
  const rush = currentPhase(game).rush;
  const pay = Math.max(
    1,
    Math.round((CFG.fareBase + dist * CFG.farePerFloor) * (rush ? CFG.rushFareMult : 1)),
  );
  game.money += pay;
  game.deliveredCount++;
  game.reputation = Math.min(CFG.repStart, game.reputation + CFG.repGainDelivery);
  addEffect(game, {
    kind: 'text',
    x: cab.shaft.x,
    y: floorCenterY(p.floor) + 46,
    text: `+${pay}`,
    color: rush ? CFG.colors.accent : CFG.colors.ink,
    t: 0,
    life: 1.1,
  });
  sfx.deliver();
  p.state = 'done';
}

export function angerLeave(game: Game, p: Passenger): void {
  game.reputation = Math.max(0, game.reputation - CFG.repLossAngry);
  game.angryCount++;
  p.state = 'gone';
  addEffect(game, { kind: 'puff', x: bayCenterX(p.bay), y: floorCenterY(p.floor), t: 0, life: 0.7 });
  if (game.reputation <= 0) {
    game.gameOver = true;
    sfx.gameOver();
  } else {
    sfx.angry();
  }
}

// ---------- покупки ----------

export function buyShaftWithCab(game: Game, bay: number, slot: number, type: CabType): boolean {
  const price = type === 'passenger' ? CFG.priceShaftPassenger : CFG.priceShaftExpress;
  const bayObj = game.bays[bay];
  if (!bayObj || game.money < price || bayObj.shafts[slot]) return false;
  game.money -= price;
  const shaft: Shaft = { id: game.nextId++, bay, slot, x: slotX(bay, slot), cabs: [] };
  shaft.cabs.push(makeCab(game, type, shaft, 0));
  bayObj.shafts[slot] = shaft;
  game.routesDirty = true;
  addEffect(game, { kind: 'ring', x: shaft.x, y: floorCenterY(1), t: 0, life: 0.8 });
  sfx.buy();
  return true;
}

export function buySecondCab(game: Game, shaft: Shaft, type: CabType): boolean {
  if (shaft.cabs.length >= CFG.maxCabsPerShaft) return false;
  const price = type === 'passenger' ? CFG.priceSecondPassenger : CFG.priceSecondExpress;
  if (game.money < price) return false;
  game.money -= price;
  const cab = makeCab(game, type, shaft, shaft.cabs.length);
  // вторая кабина появляется наверху, чтобы не конфликтовать с первой у земли
  const topFloor = game.bays[shaft.bay].floors;
  cab.y = floorCenterY(topFloor);
  cab.targetFloor = topFloor;
  shaft.cabs.push(cab);
  game.routesDirty = true;
  addEffect(game, { kind: 'ring', x: shaft.x, y: floorCenterY(topFloor), t: 0, life: 0.8 });
  sfx.buy();
  return true;
}

const upCfg: Record<UpgradeKey, { prices: number[] }> = {
  speed: CFG.upSpeed,
  capacity: CFG.upCapacity,
  doors: CFG.upDoors,
};

export function upgradePrice(cab: Cab, key: UpgradeKey): number | null {
  const lvl = cab.upgrades[key];
  const prices = upCfg[key].prices;
  return lvl < prices.length ? prices[lvl] : null;
}

export function buyUpgrade(game: Game, cab: Cab, key: UpgradeKey): boolean {
  const price = upgradePrice(cab, key);
  if (price == null || game.money < price) return false;
  game.money -= price;
  cab.upgrades[key]++;
  recalcCab(cab);
  sfx.upgrade();
  return true;
}
