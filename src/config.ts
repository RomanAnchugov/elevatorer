/**
 * Все тюнимые числа игры в одном месте.
 * Балансируй здесь, не лазая по коду.
 */

export interface DayPhase {
  name: string;
  from: number; // доля суток 0..1
  to: number;
  k: number; // базовая интенсивность спавна (пассажиров/сек × этажи)
  rush: boolean; // час пик: тариф ×1.5
  kind: 'up' | 'down' | 'mixed';
}

export const CFG = {
  // ---- мир ----
  floorH: 100,
  bayWidth: 300,
  bayGap: 30, // зазор между подъездами
  bayAtDays: [6, 12], // дни, когда въезжают подъезды 2 и 3
  newBayFloors: 4, // этажность нового подъезда при въезде
  bayRampDays: 2, // спрос нового подъезда разгоняется столько дней
  // план роста каждого подъезда: своя скорость и свой потолок этажности
  bayPlans: [
    { rate: 1.0, cap: 20 }, // главный: +этаж/день
    { rate: 0.5, cap: 14 }, // низкий сосед
    { rate: 0.65, cap: 17 }, // средний
  ],
  shaftCount: 3, // слотов под шахты в каждом подъезде
  cabW: 36,
  cabH: 64,

  // ---- день ----
  daySeconds: 45,
  startFloors: 6,

  // ---- кабины ----
  cabBaseSpeed: 95, // мировых ед/сек ≈ 1 этаж/сек
  expressSpeedMult: 2.5,
  passengerCapacity: 6,
  expressCapacity: 4,
  doorBaseTime: 1.3,
  boardTimePerPax: 0.14, // доп. время дверей за каждого посаженного
  maxCabsPerShaft: 2,
  cabGap: 10, // зазор между кабинами в общей шахте
  deadlockSeconds: 3, // взаимная блокировка дольше — кабины «протиснутся»

  // ---- экономика ----
  startMoney: 500,
  fareBase: 2, // базовая стоимость поездки — поддерживает раннюю экономику
  farePerFloor: 1,
  rushFareMult: 1.5,
  priceShaftPassenger: 400, // новая шахта + пассажирская кабина
  priceShaftExpress: 600, // новая шахта + экспресс
  priceSecondPassenger: 300, // вторая кабина в существующей шахте
  priceSecondExpress: 450,

  // ---- репутация ----
  repStart: 100,
  repLossAngry: 3, // пассажир не дождался
  repGainDelivery: 0.5, // успешная доставка
  patienceSeconds: 38,

  // ---- апгрейды (цены по уровням) ----
  upSpeed: { prices: [200, 300, 400], speedAdd: 0.22 }, // +22% скорости за уровень
  upCapacity: { prices: [200, 300, 400], capAdd: 2 }, // +2 вместимости
  upDoors: { prices: [150, 250, 350], doorMult: 0.75 }, // ×0.75 времени дверей

  // ---- фазы суток ----
  phases: [
    { name: 'УТРО', from: 0.0, to: 0.18, k: 0.13, rush: true, kind: 'up' },
    { name: 'ДЕНЬ', from: 0.18, to: 0.45, k: 0.03, rush: false, kind: 'mixed' },
    { name: 'ОБЕД', from: 0.45, to: 0.58, k: 0.07, rush: false, kind: 'mixed' },
    { name: 'ДЕНЬ', from: 0.58, to: 0.7, k: 0.03, rush: false, kind: 'mixed' },
    { name: 'ВЕЧЕР', from: 0.7, to: 0.92, k: 0.13, rush: true, kind: 'down' },
    { name: 'НОЧЬ', from: 0.92, to: 1.0, k: 0.01, rush: false, kind: 'mixed' },
  ] as DayPhase[],

  // ---- визуал ----
  colors: {
    paper: '#F4F1EA',
    ink: '#14120F',
    line: '#D9D3C6',
    faint: '#B9B2A2',
    accent: '#E8641B',
    red: '#D93A2B',
  },
};
