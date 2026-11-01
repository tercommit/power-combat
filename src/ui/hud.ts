import { CHARACTERS } from '../characters';
import { MAX_GUARD, MAX_HP, WINS_NEEDED } from '../sim/state';
import type { SimEvent, SimState } from '../sim/types';

interface Side {
  hp: HTMLElement;
  trail: HTMLElement;
  guard: HTMLElement;
  pips: HTMLElement[];
  combo: HTMLElement;
  trailValue: number;
  comboTimer: number;
}

/** Interface de combat (DOM au-dessus du canvas). */
export class Hud {
  private readonly sides: Side[];
  private readonly timer: HTMLElement;
  private readonly banner: HTMLElement;
  private bannerTimer = 0;

  constructor(root: HTMLElement, state: SimState) {
    root.innerHTML = `
      <div class="bars">
        ${[0, 1]
          .map(
            (i) => `
          <div class="side side-${i}">
            <div class="name">${CHARACTERS[state.fighters[i].character].name}</div>
            <div class="hp"><div class="trail"></div><div class="fill"></div></div>
            <div class="guard"><div class="fill"></div></div>
            <div class="pips">${'<span></span>'.repeat(WINS_NEEDED)}</div>
            <div class="combo"></div>
          </div>`,
          )
          .join('<div class="timer">99</div>')}
      </div>
      <div class="banner"></div>
      <div class="mode">CPU vs CPU · démo</div>`;
    this.timer = root.querySelector('.timer')!;
    this.banner = root.querySelector('.banner')!;
    this.sides = [0, 1].map((i) => {
      const el = root.querySelector(`.side-${i}`)!;
      return {
        hp: el.querySelector('.hp .fill')!,
        trail: el.querySelector('.hp .trail')!,
        guard: el.querySelector('.guard .fill')!,
        pips: [...el.querySelectorAll<HTMLElement>('.pips span')],
        combo: el.querySelector('.combo')!,
        trailValue: MAX_HP,
        comboTimer: 0,
      };
    });
  }

  onEvent(e: SimEvent, state: SimState): void {
    const name = (i: 0 | 1) => CHARACTERS[state.fighters[i].character].name;
    switch (e.type) {
      case 'roundStart':
        this.show(
          state.fighters.every((f) => f.wins === WINS_NEEDED - 1)
            ? 'ROUND FINAL'
            : `ROUND ${e.round}`,
          1.0,
        );
        break;
      case 'fight':
        this.show('FIGHT !', 0.8, 'big');
        break;
      case 'ko':
        this.show(e.winner === null ? 'DOUBLE K.O.' : 'K.O.', 1.6, 'big');
        break;
      case 'timeup':
        this.show(e.winner === null ? 'ÉGALITÉ' : 'TEMPS ÉCOULÉ', 1.6);
        break;
      case 'matchEnd':
        this.show(`${name(e.winner)} GAGNE !`, 3.5, 'big');
        break;
      case 'guardBreak':
        this.show('GARDE BRISÉE', 0.8, 'small');
        break;
      case 'hit':
        if (e.combo >= 2) {
          const side = this.sides[e.attacker];
          side.combo.textContent = `${e.combo} HITS`;
          side.combo.classList.remove('pop');
          void side.combo.offsetWidth;
          side.combo.classList.add('pop');
          side.comboTimer = 1.2;
        }
        break;
    }
  }

  private show(text: string, seconds: number, size = ''): void {
    this.banner.textContent = text;
    this.banner.className = `banner visible ${size}`;
    this.bannerTimer = seconds;
  }

  update(state: SimState, dt: number): void {
    this.timer.textContent = String(Math.ceil(state.timer / 60));
    state.fighters.forEach((f, i) => {
      const side = this.sides[i];
      const hp = f.hp / MAX_HP;
      side.hp.style.width = `${hp * 100}%`;
      // La barre rouge rattrape les PV avec un temps de retard.
      if (side.trailValue < f.hp) side.trailValue = f.hp;
      else side.trailValue = Math.max(f.hp, side.trailValue - MAX_HP * 0.5 * dt);
      side.trail.style.width = `${(side.trailValue / MAX_HP) * 100}%`;
      side.guard.style.width = `${(f.guard / MAX_GUARD) * 100}%`;
      side.guard.classList.toggle('low', f.guard < MAX_GUARD * 0.25);
      side.pips.forEach((pip, k) => pip.classList.toggle('won', k < f.wins));
      side.comboTimer -= dt;
      if (side.comboTimer <= 0) side.combo.textContent = '';
    });
    this.bannerTimer -= dt;
    if (this.bannerTimer <= 0) this.banner.classList.remove('visible');
  }
}
