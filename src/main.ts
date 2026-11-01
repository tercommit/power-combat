import * as THREE from 'three';
import { CPU_PROFILES, CpuController } from './ai/cpu';
import { FixedStepAccumulator } from './core/loop';
import { ScreenShake, Sparks } from './fx/effects';
import { FightCamera } from './render/camera';
import { FighterModel } from './render/fighterModel';
import { createScene } from './render/scene';
import { createInitialState, stepSim } from './sim/state';
import type { SimEvent, SimState } from './sim/types';
import { Hud } from './ui/hud';

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
const sparks = new Sparks(scene);
const shake = new ScreenShake();

// On garde l'état précédent pour interpoler le rendu entre deux pas de simulation.
let previous: SimState = createInitialState();
let current: SimState = previous;
const accumulator = new FixedStepAccumulator();

const models = current.fighters.map((f) => new FighterModel(f.character));
scene.add(...models.map((m) => m.root));
const hud = new Hud(document.getElementById('fight-hud')!, current);

function createCpus(match: number): [CpuController, CpuController] {
  const seed = Date.now() + match * 7919;
  return [
    new CpuController(0, CPU_PROFILES.medium, seed),
    new CpuController(1, CPU_PROFILES.medium, seed + 1),
  ];
}
let cpus = createCpus(0);

function onEvent(e: SimEvent): void {
  hud.onEvent(e, current);
  if (e.type === 'hit') {
    const dir = e.attacker === 0 ? 1 : -1;
    sparks.burst(e.x, e.y, dir, 6 + Math.round(e.strength * 10), '#ffd36b', 3 + e.strength * 4);
    shake.add(0.04 + e.strength * 0.14);
  } else if (e.type === 'block') {
    sparks.burst(e.x, e.y, e.attacker === 0 ? 1 : -1, 5, '#9fd8ff', 2.5);
    shake.add(0.02);
  } else if (e.type === 'guardBreak') {
    sparks.burst(e.x, e.y, e.attacker === 0 ? 1 : -1, 24, '#7fb4ff', 6);
    shake.add(0.25);
  } else if (e.type === 'ko') {
    shake.add(0.35);
  }
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
  const realElapsed = Math.min(now - lastTime, 250);
  lastTime = now;

  // Ralenti sur le coup final du round.
  const slowMo = current.phase === 'ko' && current.phaseFrame < 50;
  const { steps, alpha } = accumulator.advance(slowMo ? realElapsed * 0.3 : realElapsed);
  for (let i = 0; i < steps; i++) {
    previous = current;
    current = stepSim(current, [cpus[0].think(current), cpus[1].think(current)]);
    if (current.match !== previous.match) {
      cpus = createCpus(current.match);
      previous = current;
    }
    current.events.forEach(onEvent);
  }

  const dt = realElapsed / 1000;
  const time = now / 1000;
  const xs = current.fighters.map(
    (f, i) => previous.fighters[i].x + (f.x - previous.fighters[i].x) * alpha,
  );
  current.fighters.forEach((f, i) => models[i].update(f, xs[i], time, dt));
  sparks.update(slowMo ? dt * 0.3 : dt);
  shake.update(dt);
  hud.update(current, dt);

  fightCamera.update(xs[0], xs[1], dt);
  fightCamera.camera.position.add(shake.offset);
  renderer.render(scene, fightCamera.camera);

  fpsFrames++;
  fpsTime += realElapsed;
  if (fpsTime >= 500) {
    fpsLabel.textContent = `${Math.round((fpsFrames * 1000) / fpsTime)} FPS`;
    fpsFrames = 0;
    fpsTime = 0;
  }
});
