/**
 * Contrôleur CPU : lit l'état visible du combat et produit des intentions,
 * exactement comme le ferait une manette. Il ne modifie jamais la simulation.
 */
import { CHARACTERS } from '../characters';
import { Rng } from '../core/rng';
import { moveOf } from '../sim/state';
import { NEUTRAL, type Intent, type MoveId, type SimState } from '../sim/types';

export interface CpuProfile {
  /** Intervalle entre deux décisions (temps de réaction), en frames. */
  reaction: [number, number];
  aggression: number;
  /** Probabilité de bloquer une attaque vue à temps. */
  blockChance: number;
  /** Probabilité de choisir la bonne hauteur de garde. */
  readChance: number;
  /** Probabilité d'enchaîner après un coup léger qui touche. */
  comboChance: number;
}

export const CPU_PROFILES = {
  easy: {
    reaction: [10, 16],
    aggression: 0.35,
    blockChance: 0.3,
    readChance: 0.5,
    comboChance: 0.2,
  },
  medium: {
    reaction: [5, 10],
    aggression: 0.5,
    blockChance: 0.6,
    readChance: 0.7,
    comboChance: 0.55,
  },
  hard: {
    reaction: [3, 6],
    aggression: 0.6,
    blockChance: 0.85,
    readChance: 0.9,
    comboChance: 0.85,
  },
} satisfies Record<string, CpuProfile>;

export class CpuController {
  private readonly rng: Rng;
  private intent: Intent = NEUTRAL;
  private nextDecision = 0;
  private holdUntil = 0;

  constructor(
    private readonly index: 0 | 1,
    private readonly profile: CpuProfile,
    seed: number,
  ) {
    this.rng = new Rng(seed);
  }

  think(s: SimState): Intent {
    if (s.phase !== 'fight') {
      this.intent = NEUTRAL;
      return NEUTRAL;
    }
    // Pendant le gel d'impact, la simulation ignore les entrées.
    if (s.hitstop > 0) return NEUTRAL;
    const me = s.fighters[this.index];
    const opp = s.fighters[this.index === 0 ? 1 : 0];
    const moves = CHARACTERS[me.character].moves;
    const dist = Math.abs(opp.x - me.x);

    // Enchaînement : se décide à la frame près, le CPU « sent » que son coup a touché.
    if (me.action === 'attack' && me.moveHit && (me.move === 'lp' || me.move === 'lk')) {
      const follow: MoveId = dist <= moves.hk.reach && this.rng.chance(0.4) ? 'hk' : 'hp';
      if (dist <= moves[follow].reach && this.rng.chance(this.profile.comboChance / 4)) {
        return { move: 0, block: 'none', attack: follow };
      }
    }

    // Les attaques ne durent qu'une frame : on ne répète pas l'appui.
    if (this.intent.attack) this.intent = { ...this.intent, attack: null };
    if (s.frame < this.nextDecision) return this.intent;
    this.nextDecision = s.frame + this.rng.int(...this.profile.reaction);
    if (s.frame < this.holdUntil) return this.intent;

    this.intent = this.decide(s, dist);
    return this.intent;
  }

  private decide(s: SimState, dist: number): Intent {
    const me = s.fighters[this.index];
    const opp = s.fighters[this.index === 0 ? 1 : 0];
    const moves = CHARACTERS[me.character].moves;
    const p = this.profile;
    const oppMove = moveOf(opp);
    const inRange = (id: MoveId) => dist <= moves[id].reach;

    // L'adversaire est vulnérable : on frappe.
    if (opp.action === 'hitstun' || opp.action === 'guardBroken') {
      const options = (['hp', 'hk', 'lp', 'lk'] as const).filter(inRange);
      if (options.length) return this.attack(this.rng.pick(options));
    }

    // L'adversaire attaque et va nous atteindre : garde (si on réagit à temps).
    if (opp.action === 'attack' && oppMove && dist <= oppMove.reach + 0.3) {
      const recovering = opp.actionFrame >= oppMove.startup + oppMove.active;
      if (recovering) {
        // Punition pendant la récupération adverse.
        const punish = (['lp', 'lk', 'hp'] as const).find(inRange);
        if (punish && this.rng.chance(p.aggression + 0.2)) return this.attack(punish);
      } else if (this.rng.chance(p.blockChance)) {
        const correct = oppMove.height === 'low' ? 'low' : 'high';
        const wrong = correct === 'low' ? 'high' : 'low';
        const height = oppMove.height === 'mid' || this.rng.chance(p.readChance) ? correct : wrong;
        return this.hold(s, { move: 0, block: height, attack: null }, 12);
      }
    }

    // À portée : attaquer, garder par anticipation ou reprendre de la distance.
    if (inRange('lp') || inRange('hk')) {
      const roll = this.rng.next();
      if (roll < p.aggression) {
        const options = (['lp', 'lp', 'lk', 'hp', 'hk'] as const).filter(inRange);
        return this.attack(this.rng.pick(options));
      }
      if (roll < p.aggression + 0.2) {
        const height = this.rng.chance(0.65) ? 'high' : 'low';
        return this.hold(s, { move: 0, block: height, attack: null }, this.rng.int(10, 24));
      }
      if (roll < p.aggression + 0.35)
        return this.hold(s, { move: -1, block: 'none', attack: null }, 14);
      return NEUTRAL;
    }

    // Trop loin : on avance, avec un peu d'hésitation.
    if (this.rng.chance(0.8)) return { move: 1, block: 'none', attack: null };
    return this.hold(
      s,
      this.rng.chance(0.5) ? NEUTRAL : { move: -1, block: 'none', attack: null },
      12,
    );
  }

  private attack(move: MoveId): Intent {
    return { move: 0, block: 'none', attack: move };
  }

  private hold(s: SimState, intent: Intent, frames: number): Intent {
    this.holdUntil = s.frame + frames;
    return intent;
  }
}
