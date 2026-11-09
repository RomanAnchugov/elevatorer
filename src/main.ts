import { newGame } from './game';
import { step } from './sim/step';
import { addBay } from './sim/building';
import { computeCam } from './render/camera';
import { draw, type UIState } from './render/draw';
import { initInput } from './input';
import { initHud } from './ui/hud';
import { audioState } from './audio';

const cv = document.getElementById('cv') as HTMLCanvasElement;
const ctx = cv.getContext('2d')!;

function fit(): void {
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(cv.clientWidth * dpr);
  cv.height = Math.round(cv.clientHeight * dpr);
}
window.addEventListener('resize', fit);
fit();

const state: { game: ReturnType<typeof newGame> } = { game: newGame() };

const ui: UIState = {
  cam: computeCam(cv, state.game),
  hoverSlot: null,
  dragging: null,
  mouse: { x: 0, y: 0 },
};

const hud = initHud(() => state.game, {
  restartGame: () => {
    const g = newGame();
    g.introSeen = true;
    g.speed = 1;
    state.game = g;
  },
});

initInput(cv, () => state.game, ui, hud);

// хук для отладки и автотестов
(window as unknown as Record<string, unknown>).__elev = {
  get game() {
    return state.game;
  },
  get cam() {
    return ui.cam;
  },
  audio: audioState,
  debug: {
    addBay: () => addBay(state.game),
  },
};

const STEP = 1 / 30;
let last = performance.now();
let acc = 0;

function frame(now: number): void {
  requestAnimationFrame(frame);
  const rdt = Math.min(0.1, (now - last) / 1000);
  last = now;

  const g = state.game;
  if (!g.gameOver && g.speed > 0) {
    acc += rdt * g.speed;
    let guard = 0;
    while (acc >= STEP && guard++ < 10) {
      step(g, STEP);
      acc -= STEP;
    }
  } else {
    acc = 0;
  }

  ui.cam = computeCam(cv, g);
  draw(ctx, cv, ui.cam, g, ui);
  hud.update(g);
}

requestAnimationFrame(frame);
