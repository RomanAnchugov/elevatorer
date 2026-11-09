import { CFG } from './config';
import type { Game, Shaft } from './types';
import { makeCab } from './sim/economy';
import { slotX } from './sim/util';

export function newGame(): Game {
  const game: Game = {
    bays: [
      { index: 0, floors: CFG.startFloors, floorsAcc: 0, bornDay: 1, shafts: new Array(CFG.shaftCount).fill(null) },
    ],
    passengers: [],
    money: CFG.startMoney,
    reputation: CFG.repStart,
    day: 1,
    dayT: 0,
    speed: 0,
    time: 0,
    spawnAcc: 0,
    deliveredCount: 0,
    angryCount: 0,
    routesDirty: false,
    effects: [],
    selectedCabId: null,
    gameOver: false,
    introSeen: false,
    scoreSaved: false,
    nextId: 1,
    cabSeq: 1,
  };

  // старт: один подъезд, одна шахта с пассажирской кабиной на всю высоту
  const shaft: Shaft = { id: game.nextId++, bay: 0, slot: 0, x: slotX(0, 0), cabs: [] };
  shaft.cabs.push(makeCab(game, 'passenger', shaft, 0));
  game.bays[0].shafts[0] = shaft;
  return game;
}
