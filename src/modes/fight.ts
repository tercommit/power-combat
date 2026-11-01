import { CPU_PROFILES, CpuController } from '../ai/cpu';
import { FixedStepAccumulator } from '../core/loop';
import { ScreenShake, Sparks } from '../fx/effects';
import { FightCamera } from '../render/camera';
import { FighterModel } from '../render/fighterModel';
import { createInitialState, stepSim } from '../sim/state';
import type { SimEvent, SimState } from '../sim/types';
import { Hud } from '../ui/hud';
import type { Mode, ModeContext } from './mode';

/** Combat CPU contre CPU, en boucle. */
export class FightMode implements Mode {
  private readonly fightCamera: FightCamera;
  private readonly sparks: Sparks;
  private readonly shake = new ScreenShake();
  private readonly accumulator = new FixedStepAccumulator();
  private readonly models: FighterModel[];
  private readonly hud: Hud;
  // On garde l'état précédent pour interpoler le rendu entre deux pas de simulation.
  private previous: SimState = createInitialState();
  private current: SimState = this.previous;
  private cpus = FightMode.createCpus(0);

  constructor(private readonly ctx: ModeContext) {
    this.fightCamera = new FightCamera(ctx.aspect());
    this.sparks = new Sparks(ctx.scene);
    this.models = this.current.fighters.map((f) => new FighterModel(ctx.assets, f.character));
    ctx.scene.add(...this.models.map((m) => m.root));

    ctx.ui.innerHTML = `<div class="fight-hud"></div><button class="back-button">☰ Menu</button>`;
    ctx.ui.querySelector('.back-button')!.addEventListener('click', () => ctx.navigate(''));
    this.hud = new Hud(ctx.ui.querySelector('.fight-hud')!, this.current);
    this.fightCamera.update(this.current.fighters[0].x, this.current.fighters[1].x, 0, true);
  }

  get camera() {
    return this.fightCamera.camera;
  }

  private static createCpus(match: number): [CpuController, CpuController] {
    const seed = Date.now() + match * 7919;
    return [
      new CpuController(0, CPU_PROFILES.medium, seed),
      new CpuController(1, CPU_PROFILES.medium, seed + 1),
    ];
  }

  private onEvent(e: SimEvent): void {
    this.hud.onEvent(e, this.current);
    if (e.type === 'hit') {
      const dir = e.attacker === 0 ? 1 : -1;
      this.sparks.burst(
        e.x,
        e.y,
        dir,
        6 + Math.round(e.strength * 10),
        '#ffd36b',
        3 + e.strength * 4,
      );
      this.shake.add(0.04 + e.strength * 0.14);
    } else if (e.type === 'block') {
      this.sparks.burst(e.x, e.y, e.attacker === 0 ? 1 : -1, 5, '#9fd8ff', 2.5);
      this.shake.add(0.02);
    } else if (e.type === 'guardBreak') {
      this.sparks.burst(e.x, e.y, e.attacker === 0 ? 1 : -1, 24, '#7fb4ff', 6);
      this.shake.add(0.25);
    } else if (e.type === 'ko') {
      this.shake.add(0.35);
    }
  }

  update(now: number, elapsedMs: number): void {
    // Ralenti sur le coup final du round.
    const slowMo = this.current.phase === 'ko' && this.current.phaseFrame < 50;
    const { steps, alpha } = this.accumulator.advance(slowMo ? elapsedMs * 0.3 : elapsedMs);
    for (let i = 0; i < steps; i++) {
      this.previous = this.current;
      this.current = stepSim(this.current, [
        this.cpus[0].think(this.current),
        this.cpus[1].think(this.current),
      ]);
      if (this.current.match !== this.previous.match) {
        this.cpus = FightMode.createCpus(this.current.match);
        this.previous = this.current;
      }
      this.current.events.forEach((e) => this.onEvent(e));
    }

    const dt = elapsedMs / 1000;
    const time = now / 1000;
    const xs = this.current.fighters.map(
      (f, i) => this.previous.fighters[i].x + (f.x - this.previous.fighters[i].x) * alpha,
    );
    this.current.fighters.forEach((f, i) => this.models[i].update(f, xs[i], time, dt));
    this.sparks.update(slowMo ? dt * 0.3 : dt);
    this.shake.update(dt);
    this.hud.update(this.current, dt);

    this.fightCamera.update(xs[0], xs[1], dt);
    this.camera.position.add(this.shake.offset);
  }

  resize(aspect: number): void {
    this.fightCamera.setAspect(aspect);
  }

  dispose(): void {
    this.ctx.scene.remove(...this.models.map((m) => m.root));
    this.sparks.dispose();
  }
}
