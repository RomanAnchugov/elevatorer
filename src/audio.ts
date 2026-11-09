/**
 * Генеративные минималистичные звуки в духе Mini Metro: Web Audio, без файлов.
 *
 * — «Плюки» доставок играют восходящую пентатонику каскадом: при наплыве
 *   ноты расходятся с интервалом и складываются в нежную гамму.
 * — Мягкое эхо (короткий тёмный дилэй) даёт нотам «хвост» и ощущение
 *   пространства — музыкальность без низкого давящего фона.
 * — Каскадный планировщик ограничивает плотность при наплыве событий.
 *
 * AudioContext создаётся по первому жесту пользователя (клик «Начать смену»).
 */

const PENTATONIC = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0];

const MUTE_KEY = 'elevatorer_muted';
const VOLUME = 0.6;

export const audioState = {
  started: false,
  muted: false,
  scheduled: 0,
  get ctxState(): string {
    return ctx ? ctx.state : 'none';
  },
};

// предпочтение читаем сразу при загрузке модуля
audioState.muted = localStorage.getItem(MUTE_KEY) === '1';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let echoBus: GainNode | null = null; // посыл «плюков» в дилэй — хвост пространства
let nextFree = 0; // каскадный планировщик: ноты встают в очередь с интервалом
let noteIdx = 0; // позиция в пентатонической лестнице доставок

/** Вызвать из обработчика реального клика. */
export function initAudio(): void {
  if (ctx) {
    void ctx.resume();
    return;
  }
  const AC: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 20;
  comp.ratio.value = 6;
  master = ctx.createGain();
  master.gain.value = audioState.muted ? 0 : VOLUME;
  master.connect(comp);
  comp.connect(ctx.destination);

  // эхо: короткий тёмный дилэй с затуханием — «плюки» получают мягкий хвост
  echoBus = ctx.createGain();
  echoBus.gain.value = 1;
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.31;
  const fb = ctx.createGain();
  fb.gain.value = 0.38;
  const fbLp = ctx.createBiquadFilter();
  fbLp.type = 'lowpass';
  fbLp.frequency.value = 1600;
  const wet = ctx.createGain();
  wet.gain.value = 0.3;
  echoBus.connect(delay);
  delay.connect(fbLp);
  fbLp.connect(fb);
  fb.connect(delay);
  delay.connect(wet);
  wet.connect(master);

  audioState.started = true;
  void ctx.resume();
}

export function isMuted(): boolean {
  return audioState.muted;
}

export function toggleMute(): boolean {
  audioState.muted = !audioState.muted;
  localStorage.setItem(MUTE_KEY, audioState.muted ? '1' : '0');
  if (master && ctx) master.gain.setTargetAtTime(audioState.muted ? 0 : VOLUME, ctx.currentTime, 0.02);
  return audioState.muted;
}

// ---------- «плюки» ----------

interface PluckOpts {
  gain?: number;
  decay?: number;
  pan?: number;
  cutoff?: number;
  dark?: boolean; // глухой синус без светлой октавы — для «мгм»
}

/** Один «плюк»: треугольник + октавный синус, мягкая атака, экспоненциальный спад. */
function pluck(freq: number, at: number, o: PluckOpts = {}): void {
  if (!ctx || !master) return;
  const { gain = 0.2, decay = 0.8, pan = 0, cutoff = 2600, dark = false } = o;

  const osc = ctx.createOscillator();
  osc.type = dark ? 'sine' : 'triangle';
  osc.frequency.setValueAtTime(freq, at);

  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(freq * (dark ? 1.004 : 2), at); // светлые: октава; глухие: лёгкое биение

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0008, at + decay);

  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.0001, at);
  g2.gain.linearRampToValueAtTime(gain * 0.22, at + 0.006);
  g2.gain.exponentialRampToValueAtTime(0.0005, at + Math.max(0.08, decay * 0.35));

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = cutoff;
  lp.Q.value = 0.6;

  const pn = ctx.createStereoPanner();
  pn.pan.value = pan;

  osc.connect(g);
  osc2.connect(g2);
  g.connect(lp);
  g2.connect(lp);
  lp.connect(pn);
  pn.connect(master);
  if (echoBus) pn.connect(echoBus); // посыл в эхо — мягкий хвост после ноты

  osc.start(at);
  osc2.start(at);
  osc.stop(at + decay + 0.1);
  osc2.stop(at + Math.max(0.1, decay * 0.35) + 0.1);
}

/**
 * Поставить ноту в каскад: если событий много подряд, они расходятся
 * с интервалом gap и звучат как нежная гамма, а не каша.
 * droppable — второстепенные звуки, выкидываются при переполнении очереди.
 */
function schedule(play: (t: number) => void, gap = 0.07, droppable = false): void {
  if (!ctx || audioState.muted) return;
  const now = ctx.currentTime;
  if (droppable && nextFree > now + 1.2) return;
  const t = Math.max(now + 0.02, nextFree);
  play(t);
  audioState.scheduled++;
  nextFree = t + gap;
}

export const sfx = {
  /** Пассажир доставлен — следующая нота восходящей пентатоники. */
  deliver(): void {
    schedule((t) => {
      pluck(PENTATONIC[noteIdx % PENTATONIC.length], t, { gain: 0.22, decay: 0.9 });
      noteIdx++;
    }, 0.07);
  },

  /** Пассажир зашёл в кабину — деликатный высокий птик. */
  pickup(): void {
    schedule((t) => pluck(1318.5, t, { gain: 0.05, decay: 0.18, cutoff: 4200 }), 0.06, true);
  },

  /** Пассажир не дождался — глухой нисходящий «мгм» (си → соль). */
  angry(): void {
    schedule((t) => {
      pluck(246.94, t, { gain: 0.15, decay: 1.1, cutoff: 900, dark: true });
      pluck(196.0, t + 0.16, { gain: 0.14, decay: 1.2, cutoff: 800, dark: true });
    }, 0.1);
  },

  /** Новый этаж — восходящий мотив (соль через квинту). */
  grow(): void {
    schedule((t) => {
      pluck(523.25, t, { gain: 0.2, decay: 1.0 });
      pluck(783.99, t + 0.16, { gain: 0.2, decay: 1.1 });
    }, 0.1);
  },

  /** Покупка лифта — мажорное арпеджио. */
  buy(): void {
    schedule((t) => {
      pluck(523.25, t, { gain: 0.16, decay: 0.7 });
      pluck(659.25, t + 0.09, { gain: 0.16, decay: 0.7 });
      pluck(783.99, t + 0.18, { gain: 0.2, decay: 1.0 });
    }, 0.1);
  },

  /** Апгрейд — нота через квинту вверх. */
  upgrade(): void {
    schedule((t) => {
      pluck(659.25, t, { gain: 0.16, decay: 0.6 });
      pluck(987.77, t + 0.1, { gain: 0.18, decay: 0.9 });
    }, 0.1);
  },

  /** Начало смены — тёплый разбег до тоники. */
  start(): void {
    schedule((t) => {
      pluck(261.63, t, { gain: 0.16, decay: 0.9 });
      pluck(392.0, t + 0.12, { gain: 0.16, decay: 0.9 });
      pluck(523.25, t + 0.24, { gain: 0.2, decay: 1.2 });
    }, 0.1);
  },

  /** Конец смены — медленный спуск. */
  gameOver(): void {
    schedule((t) => {
      pluck(392.0, t, { gain: 0.18, decay: 1.4 });
      pluck(329.63, t + 0.4, { gain: 0.18, decay: 1.4 });
      pluck(261.63, t + 0.8, { gain: 0.18, decay: 1.6 });
      pluck(196.0, t + 1.2, { gain: 0.2, decay: 2.2, dark: true });
    }, 0.5);
  },

  /** Тихий тик — перелёты ручки зоны по этажам. */
  tick(): void {
    schedule((t) => pluck(880.0, t, { gain: 0.05, decay: 0.12, cutoff: 5000 }), 0.05, true);
  },
};
