import * as THREE from 'three';
import { FarmMode } from './modes/farm';
import { FightMode } from './modes/fight';
import { GalleryMode } from './modes/gallery';
import { MenuMode } from './modes/menu';
import type { Mode, ModeContext } from './modes/mode';
import { loadFighterAssets } from './render/fighterModel';
import { createScene } from './render/scene';

const container = document.getElementById('app')!;
const fpsLabel = document.getElementById('fps')!;
// Compteur d'images affiché seulement avec ?debug dans l'URL.
fpsLabel.hidden = !new URLSearchParams(location.search).has('debug');
const ui = document.getElementById('ui')!;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
container.appendChild(renderer.domElement);

const scene = createScene();

const loading = document.getElementById('loading')!;
const assets = await loadFighterAssets().catch((err: unknown) => {
  loading.textContent = 'Impossible de charger les modèles 3D.';
  throw err;
});
loading.remove();

const aspect = () => window.innerWidth / window.innerHeight;
const ctx: ModeContext = {
  scene,
  assets,
  ui,
  canvas: renderer.domElement,
  aspect,
  navigate: (hash) => {
    location.hash = hash;
  },
};

// Routage par l'URL : #fight, #farm, #farm/ia, #gallery/kai/lk… (vide = menu).
let mode: Mode;
function route(): void {
  mode?.dispose();
  ui.innerHTML = '';
  const [name, ...rest] = location.hash.replace(/^#/, '').split('/');
  if (name === 'fight') mode = new FightMode(ctx);
  else if (name === 'farm') mode = new FarmMode(ctx, rest);
  else if (name === 'gallery') mode = new GalleryMode(ctx, rest);
  else mode = new MenuMode(ctx);
}
window.addEventListener('hashchange', route);
route();

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && location.hash) ctx.navigate('');
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  mode.resize(aspect());
});

let lastTime = performance.now();
let fpsFrames = 0;
let fpsTime = 0;

renderer.setAnimationLoop((now) => {
  const elapsed = Math.min(now - lastTime, 250);
  lastTime = now;
  mode.update(now, elapsed);
  renderer.render(scene, mode.camera);

  fpsFrames++;
  fpsTime += elapsed;
  if (fpsTime >= 500) {
    fpsLabel.textContent = `${Math.round((fpsFrames * 1000) / fpsTime)} FPS`;
    fpsFrames = 0;
    fpsTime = 0;
  }
});
