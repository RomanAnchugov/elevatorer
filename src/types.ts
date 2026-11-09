import type { DayPhase } from './config';

export type CabType = 'passenger' | 'express';
export type UpgradeKey = 'speed' | 'capacity' | 'doors';

export interface Passenger {
  id: number;
  bay: number; // подъезд (пассажиры перемещаются только внутри своего)
  origin: number; // этаж появления
  dest: number; // целевой этаж
  floor: number; // текущий этаж (для ожидающих)
  state: 'waiting' | 'riding' | 'done' | 'gone';
  rideExit: number | null; // запланированный выход из текущей кабины
  inCab: Cab | null;
  patience: number; // секунды до ухода (тикают только в ожидании)
  patienceMax: number;
  bobT: number; // фаза анимации
}

export interface Cab {
  id: number;
  type: CabType;
  shaft: Shaft;
  indexInShaft: number; // 0 или 1
  y: number; // мировая координата центра
  rangeMin: number; // нижний этаж зоны
  rangeMax: number; // верхний этаж зоны
  direction: -1 | 0 | 1;
  state: 'idle' | 'doors' | 'moving' | 'blocked';
  doorT: number; // таймер открытых дверей
  blockT: number; // сколько секунд стоим в блокировке
  targetFloor: number;
  passengers: Passenger[];
  upgrades: Record<UpgradeKey, number>;
  // производные от типа и апгрейдов:
  speed: number;
  capacity: number;
  doorTime: number;
}

export interface Shaft {
  id: number;
  bay: number; // индекс подъезда
  slot: number; // индекс слота в подъезде
  x: number; // мировая координата центра шахты
  cabs: Cab[];
}

export interface Bay {
  index: number;
  floors: number; // текущая этажность подъезда
  floorsAcc: number; // накопитель роста (дробные скорости)
  bornDay: number; // день въезда (для разгона спроса)
  shafts: (Shaft | null)[]; // по слотам
}

export interface Effect {
  kind: 'text' | 'ring' | 'puff';
  x: number;
  y: number;
  text?: string;
  color?: string;
  t: number;
  life: number;
}

export interface Game {
  bays: Bay[]; // подъезды, каждый со своими слотами и этажностью
  passengers: Passenger[];
  money: number;
  reputation: number;
  day: number;
  dayT: number; // 0..1 доля суток
  speed: 0 | 1 | 2;
  time: number; // всего секунд симуляции
  spawnAcc: number;
  deliveredCount: number;
  angryCount: number;
  routesDirty: boolean;
  effects: Effect[];
  selectedCabId: number | null;
  gameOver: boolean;
  introSeen: boolean;
  scoreSaved: boolean;
  nextId: number;
  cabSeq: number;
}

export type { DayPhase };
