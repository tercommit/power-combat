import * as THREE from 'three';
import { FighterModel } from '../render/fighterModel';
import { createInitialState } from '../sim/state';
import type { FighterState } from '../sim/types';
import type { Mode, ModeContext } from './mode';

const ENTRIES = [
  { hash: 'fight', label: 'Combat IA', hint: 'Kai contre Brick, piloté par l’ordinateur' },
  {
    hash: 'farm',
    label: 'Récolte',
    hint: 'Couper du bois, casser des pierres, améliorer ses outils',
  },
  {
    hash: 'farm/ia',
    label: 'Récolte IA',
    hint: 'Regarder l’ordinateur farmer et améliorer ses outils',
  },
  { hash: 'gallery', label: 'Galerie d’animations', hint: 'Voir et inspecter chaque animation' },
];

/** Écran titre : les deux combattants en garde, caméra en orbite lente. */
export class MenuMode implements Mode {
  readonly camera: THREE.PerspectiveCamera;
  private readonly models: FighterModel[];
  private readonly fighters: FighterState[];
  private readonly buttons: HTMLButtonElement[];
  private selected = 0;
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      e.preventDefault();
      const step = e.code === 'ArrowDown' ? 1 : -1;
      this.select((this.selected + step + ENTRIES.length) % ENTRIES.length);
    } else if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      this.ctx.navigate(ENTRIES[this.selected].hash);
    }
  };

  constructor(private readonly ctx: ModeContext) {
    this.camera = new THREE.PerspectiveCamera(40, ctx.aspect(), 0.1, 200);
    const state = createInitialState();
    this.fighters = state.fighters.map((f) => ({ ...f, x: f.x * 0.6 }));
    this.models = this.fighters.map((f) => new FighterModel(ctx.assets, f.character));
    ctx.scene.add(...this.models.map((m) => m.root));

    ctx.ui.innerHTML = `
      <div class="menu">
        <h1>POWER<span>COMBAT</span></h1>
        <nav>${ENTRIES.map((e) => `<button data-hash="${e.hash}"><strong>${e.label}</strong><small>${e.hint}</small></button>`).join('')}</nav>
        <p class="menu-help">↑ ↓ pour choisir · Entrée pour valider</p>
      </div>`;
    this.buttons = [...ctx.ui.querySelectorAll<HTMLButtonElement>('nav button')];
    this.buttons.forEach((b, i) => {
      b.addEventListener('click', () => ctx.navigate(b.dataset.hash!));
      b.addEventListener('mouseenter', () => this.select(i));
    });
    this.select(0);
    window.addEventListener('keydown', this.onKey);
  }

  private select(i: number): void {
    this.selected = i;
    this.buttons.forEach((b, k) => b.classList.toggle('selected', k === i));
  }

  update(now: number, elapsedMs: number): void {
    const time = now / 1000;
    this.fighters.forEach((f, i) => this.models[i].update(f, f.x, time, elapsedMs / 1000));
    const angle = time * 0.15;
    this.camera.position.set(Math.sin(angle) * 5.5, 1.6, Math.cos(angle) * 5.5);
    this.camera.lookAt(0, 1.1, 0);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.ctx.scene.remove(...this.models.map((m) => m.root));
  }
}
