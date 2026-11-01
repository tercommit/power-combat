import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CHARACTERS } from '../characters';
import { FighterModel } from '../render/fighterModel';
import { createInitialState } from '../sim/state';
import type { CharacterId } from '../sim/types';
import { buildCatalog, phaseAt, type GalleryEntry, type Group } from './galleryCatalog';
import type { Mode, ModeContext } from './mode';

const CHARACTER_IDS: CharacterId[] = ['kai', 'brick'];
const GROUPS: Group[] = ['Postures', 'Coups', 'Réactions'];
const SPEEDS = [0.1, 0.25, 0.5, 1];
const PHASE_LABELS = { startup: 'Préparation', active: 'Impact', recovery: 'Récupération' };
const PHASE_COLORS = { startup: '#e0a030', active: '#e3342f', recovery: '#4a7fd6' };

const VIEWS = {
  side: { label: 'Côté', position: [0.4, 1.3, 4.2] },
  front: { label: 'Face', position: [3.8, 1.4, 1.2] },
  back: { label: 'Dos', position: [-3.8, 1.4, 1.2] },
  top: { label: 'Dessus', position: [0.4, 5, 1.5] },
} as const;
type View = keyof typeof VIEWS;

/**
 * Galerie : lecture d'une animation à la fois, image par image si besoin,
 * avec un mannequin cible à la portée du coup.
 */
export class GalleryMode implements Mode {
  readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly models: Record<CharacterId, FighterModel>;
  private readonly dummies: Record<CharacterId, FighterModel>;
  private character: CharacterId = 'kai';
  private catalog: GalleryEntry[] = buildCatalog('kai');
  private entry: GalleryEntry = this.catalog[0];
  private frame = 0;
  private frameAccumulator = 0;
  private playing = true;
  private loop = true;
  private speed = 1;
  private showDummy = true;
  private readonly el: Record<string, HTMLElement>;
  private readonly onKey = (e: KeyboardEvent) => this.handleKey(e);

  constructor(
    private readonly ctx: ModeContext,
    route: string[],
  ) {
    this.camera = new THREE.PerspectiveCamera(40, ctx.aspect(), 0.1, 200);
    this.controls = new OrbitControls(this.camera, ctx.canvas);
    this.controls.target.set(0.4, 1, 0);
    this.controls.enableDamping = true;
    this.setView('side');

    // Un modèle par personnage, pour passer de l'un à l'autre sans recharger.
    this.models = {
      kai: new FighterModel(ctx.assets, 'kai'),
      brick: new FighterModel(ctx.assets, 'brick'),
    };
    this.dummies = {
      kai: new FighterModel(ctx.assets, 'kai'),
      brick: new FighterModel(ctx.assets, 'brick'),
    };
    ctx.scene.add(...Object.values(this.models).map((m) => m.root));
    ctx.scene.add(...Object.values(this.dummies).map((m) => m.root));

    ctx.ui.innerHTML = `
      <div class="gallery">
        <aside class="g-list">
          <div class="g-chars">${CHARACTER_IDS.map((c) => `<button data-char="${c}">${CHARACTERS[c].name}</button>`).join('')}</div>
          <div class="g-entries"></div>
        </aside>
        <section class="g-info"></section>
        <div class="g-bar">
          <div class="g-controls">
            <button data-act="first" title="Début">⏮</button>
            <button data-act="prev" title="Image précédente (←)">◀︎</button>
            <button data-act="play" class="g-play" title="Lecture / pause (Espace)">⏸</button>
            <button data-act="next" title="Image suivante (→)">▶︎</button>
            <span class="g-frame"></span>
            <label>Vitesse <select class="g-speed">${SPEEDS.map((s) => `<option value="${s}" ${s === 1 ? 'selected' : ''}>×${s}</option>`).join('')}</select></label>
            <label><input type="checkbox" class="g-loop" checked> Boucle</label>
            <label><input type="checkbox" class="g-dummy" checked> Cible</label>
            <span class="g-views">${Object.entries(VIEWS)
              .map(([k, v]) => `<button data-view="${k}">${v.label}</button>`)
              .join('')}</span>
          </div>
          <div class="g-timeline"><div class="g-phases"></div><input type="range" class="g-scrub" min="0" value="0"></div>
        </div>
        <button class="back-button">☰ Menu</button>
      </div>`;
    const q = (sel: string) => ctx.ui.querySelector<HTMLElement>(sel)!;
    this.el = {
      entries: q('.g-entries'),
      info: q('.g-info'),
      frame: q('.g-frame'),
      play: q('.g-play'),
      scrub: q('.g-scrub'),
      phases: q('.g-phases'),
    };

    ctx.ui.querySelector('.back-button')!.addEventListener('click', () => ctx.navigate(''));
    ctx.ui
      .querySelectorAll<HTMLButtonElement>('[data-char]')
      .forEach((b) =>
        b.addEventListener('click', () => this.selectCharacter(b.dataset.char as CharacterId)),
      );
    ctx.ui
      .querySelectorAll<HTMLButtonElement>('[data-view]')
      .forEach((b) => b.addEventListener('click', () => this.setView(b.dataset.view as View)));
    ctx.ui
      .querySelectorAll<HTMLButtonElement>('[data-act]')
      .forEach((b) => b.addEventListener('click', () => this.action(b.dataset.act!)));
    q('.g-speed').addEventListener(
      'change',
      (e) => (this.speed = Number((e.target as HTMLSelectElement).value)),
    );
    q('.g-loop').addEventListener(
      'change',
      (e) => (this.loop = (e.target as HTMLInputElement).checked),
    );
    q('.g-dummy').addEventListener(
      'change',
      (e) => (this.showDummy = (e.target as HTMLInputElement).checked),
    );
    this.el.scrub.addEventListener('input', () => {
      this.playing = false;
      this.frame = Number((this.el.scrub as HTMLInputElement).value);
      this.refreshControls();
    });
    window.addEventListener('keydown', this.onKey);

    // Route : #gallery/<perso>/<animation>
    const [char, id] = route;
    this.selectCharacter(
      CHARACTER_IDS.includes(char as CharacterId) ? (char as CharacterId) : 'kai',
      id,
    );
  }

  private selectCharacter(character: CharacterId, entryId = this.entry.id): void {
    this.character = character;
    this.catalog = buildCatalog(character);
    this.ctx.ui
      .querySelectorAll<HTMLButtonElement>('[data-char]')
      .forEach((b) => b.classList.toggle('selected', b.dataset.char === character));
    this.el.entries.innerHTML = GROUPS.map(
      (g) => `
        <h3>${g}</h3>
        ${this.catalog
          .filter((e) => e.group === g)
          .map(
            (e) =>
              `<button data-entry="${e.id}"><span>${e.label}</span><code>${e.id}</code></button>`,
          )
          .join('')}`,
    ).join('');
    this.el.entries
      .querySelectorAll<HTMLButtonElement>('[data-entry]')
      .forEach((b) => b.addEventListener('click', () => this.selectEntry(b.dataset.entry!)));
    this.selectEntry(entryId);
  }

  private selectEntry(id: string): void {
    this.entry = this.catalog.find((e) => e.id === id) ?? this.catalog[0];
    this.frame = 0;
    this.frameAccumulator = 0;
    this.playing = true;
    history.replaceState(null, '', `#gallery/${this.character}/${this.entry.id}`);
    this.el.entries
      .querySelectorAll<HTMLButtonElement>('[data-entry]')
      .forEach((b) => b.classList.toggle('selected', b.dataset.entry === this.entry.id));
    (this.el.scrub as HTMLInputElement).max = String(this.entry.frames - 1);
    // Frise des phases du coup sous le curseur.
    const total = this.entry.frames;
    this.el.phases.innerHTML = this.entry.phases
      .map(
        (p) =>
          `<span style="left:${(p.from / total) * 100}%;width:${((p.to - p.from) / total) * 100}%;background:${PHASE_COLORS[p.name]}" title="${PHASE_LABELS[p.name]}"></span>`,
      )
      .join('');
    this.refreshControls();
  }

  private setView(view: View): void {
    this.camera.position.fromArray(VIEWS[view].position);
    this.controls.target.set(0.4, 1, 0);
    this.controls.update();
  }

  private action(act: string): void {
    if (act === 'play') {
      if (!this.playing && this.frame >= this.entry.frames - 1) this.frame = 0;
      this.playing = !this.playing;
    } else {
      this.playing = false;
      if (act === 'first') this.frame = 0;
      if (act === 'prev') this.frame = Math.max(0, this.frame - 1);
      if (act === 'next') this.frame = Math.min(this.entry.frames - 1, this.frame + 1);
    }
    this.refreshControls();
  }

  private handleKey(e: KeyboardEvent): void {
    if ((e.target as HTMLElement).tagName === 'SELECT') return;
    const keys: Record<string, () => void> = {
      Space: () => this.action('play'),
      ArrowLeft: () => this.action('prev'),
      ArrowRight: () => this.action('next'),
      ArrowUp: () => this.stepEntry(-1),
      ArrowDown: () => this.stepEntry(1),
    };
    const run = keys[e.code];
    if (run) {
      e.preventDefault();
      run();
    }
  }

  private stepEntry(step: number): void {
    const i = this.catalog.indexOf(this.entry);
    this.selectEntry(this.catalog[(i + step + this.catalog.length) % this.catalog.length].id);
  }

  private refreshControls(): void {
    const { entry, frame } = this;
    (this.el.scrub as HTMLInputElement).value = String(frame);
    this.el.play.textContent = this.playing ? '⏸' : '▶';
    this.el.frame.textContent = `Image ${frame + 1} / ${entry.frames}`;

    const phase = phaseAt(entry, frame);
    const move = entry.move;
    const stats = move
      ? `<dl>
          <dt>Préparation</dt><dd>${move.startup} im.</dd>
          <dt>Impact</dt><dd>${move.active} im.</dd>
          <dt>Récupération</dt><dd>${move.recovery} im.</dd>
          <dt>Dégâts</dt><dd>${move.damage}</dd>
          <dt>Hauteur</dt><dd>${{ high: 'haut', mid: 'milieu', low: 'bas' }[move.height]}</dd>
          <dt>Portée</dt><dd>${move.reach.toFixed(2)} m</dd>
        </dl>`
      : '';
    this.el.info.innerHTML = `
      <code class="g-id">${this.character}/${entry.id}</code>
      <h2>${entry.label}</h2>
      ${phase ? `<span class="g-phase" style="background:${PHASE_COLORS[phase.name]}">${PHASE_LABELS[phase.name]}</span>` : ''}
      ${stats}`;
  }

  update(_now: number, elapsedMs: number): void {
    const { entry } = this;
    if (this.playing) {
      this.frameAccumulator += (elapsedMs / 1000) * 60 * this.speed;
      const advance = Math.floor(this.frameAccumulator);
      if (advance > 0) {
        this.frameAccumulator -= advance;
        this.frame += advance;
        if (this.frame >= entry.frames) {
          if (this.loop) {
            this.frame %= entry.frames;
          } else {
            this.frame = entry.frames - 1;
            this.playing = false;
          }
        }
        this.refreshControls();
      }
    }

    const dt = (elapsedMs / 1000) * (this.playing ? this.speed : 1);
    const time = this.frame / 60;
    for (const c of CHARACTER_IDS) {
      const active = c === this.character;
      this.models[c].root.visible = active;
      if (active) this.models[c].update(entry.stateAt(this.frame), 0, time, dt);

      // Le mannequin cible est l'autre personnage, placé à la portée du coup.
      const dummy = this.dummies[c];
      dummy.root.visible = this.showDummy && c !== this.character;
      if (dummy.root.visible) {
        const idle = { ...createInitialState().fighters[1], character: c, facing: -1 as const };
        dummy.update(idle, entry.dummyDistance, time, dt);
      }
    }
    this.controls.update();
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.controls.dispose();
    this.ctx.scene.remove(...Object.values(this.models).map((m) => m.root));
    this.ctx.scene.remove(...Object.values(this.dummies).map((m) => m.root));
  }
}
