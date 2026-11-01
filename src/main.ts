import * as THREE from 'three';
import { FixedStepAccumulator } from './core/loop';
import { FightCamera } from './render/camera';
import { createFighterPlaceholder, createScene, placeFighter } from './render/scene';
import { createInitialState, stepSim, type FighterState, type SimState } from './sim/state';

const container = document.getElementById('app')!;
const fpsLabel = document.getElementById('fps')!;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
container.appendChild(renderer.domElement);

const scene = createScene();
const fightCamera = new FightCamera(window.innerWidth / window.innerHeight);
const models = [createFighterPlaceholder('#e8742a'), createFighterPlaceholder('#2f6fd6')];
scene.add(...models);

// On garde l'état précédent pour interpoler le rendu entre deux pas de simulation.
let previous: SimState = createInitialState();
let current: SimState = previous;
const accumulator = new FixedStepAccumulator();

function lerpFighter(a: FighterState, b: FighterState, alpha: number): FighterState {
  return { x: a.x + (b.x - a.x) * alpha, y: a.y + (b.y - a.y) * alpha, facing: b.facing };
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  fightCamera.setAspect(window.innerWidth / window.innerHeight);
});

let lastTime = performance.now();
let fpsFrames = 0;
let fpsTime = 0;
fightCamera.update(current.fighters[0].x, current.fighters[1].x, 0, true);

renderer.setAnimationLoop((now) => {
  const elapsed = now - lastTime;
  lastTime = now;

  const { steps, alpha } = accumulator.advance(elapsed);
  for (let i = 0; i < steps; i++) {
    previous = current;
    current = stepSim(current);
  }

  const shown = [0, 1].map((i) => lerpFighter(previous.fighters[i], current.fighters[i], alpha));
  shown.forEach((state, i) => placeFighter(models[i], state));
  fightCamera.update(shown[0].x, shown[1].x, Math.min(elapsed, 250) / 1000);
  renderer.render(scene, fightCamera.camera);

  fpsFrames++;
  fpsTime += elapsed;
  if (fpsTime >= 500) {
    fpsLabel.textContent = `${Math.round((fpsFrames * 1000) / fpsTime)} FPS`;
    fpsFrames = 0;
    fpsTime = 0;
  }
});
