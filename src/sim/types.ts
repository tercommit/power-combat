export type Facing = 1 | -1;
export type Height = 'high' | 'mid' | 'low';
export type MoveId = 'lp' | 'hp' | 'lk' | 'hk';
export type CharacterId = 'kai' | 'brick';

/** Données d'un coup, en frames (1/60 s) et en mètres. */
export interface MoveData {
  name: string;
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  height: Height;
  /** Portée maximale, mesurée de centre à centre des combattants. */
  reach: number;
  hitstun: number;
  blockstun: number;
  /** Vitesse de recul infligée (m/frame), amortie ensuite par friction. */
  knockback: number;
  hitstop: number;
  guardCost: number;
  /** Encaisse un coup pendant la préparation sans être interrompu (dégâts réduits). */
  armor?: boolean;
}

export interface CharacterData {
  id: CharacterId;
  name: string;
  walkSpeed: number;
  backSpeed: number;
  moves: Record<MoveId, MoveData>;
}

/** Ce qu'un contrôleur (joueur ou CPU) demande pour une frame. */
export interface Intent {
  /** -1 = recule, 0 = immobile, 1 = avance (relatif à l'adversaire). */
  move: -1 | 0 | 1;
  block: 'none' | 'high' | 'low';
  attack: MoveId | null;
}

export const NEUTRAL: Intent = { move: 0, block: 'none', attack: null };

export type Action =
  'idle' | 'walk' | 'attack' | 'block' | 'hitstun' | 'blockstun' | 'guardBroken' | 'ko' | 'victory';

export interface FighterState {
  character: CharacterId;
  x: number;
  y: number;
  vx: number;
  facing: Facing;
  hp: number;
  guard: number;
  guardRegenDelay: number;
  action: Action;
  actionFrame: number;
  /** Durée de l'étourdissement en cours (hitstun, blockstun, garde brisée). */
  stun: number;
  move: MoveId | null;
  moveHit: boolean;
  blockHeight: 'high' | 'low';
  /** Hauteur du dernier coup encaissé (choix de l'animation de réaction). */
  hitHeight: Height;
  walkDir: -1 | 0 | 1;
  /** Nombre de coups encaissés d'affilée (pour la réduction de dégâts). */
  comboTaken: number;
  /** Frames restantes de flash blanc (rendu). */
  flash: number;
  wins: number;
}

export type Phase = 'intro' | 'fight' | 'ko' | 'timeup' | 'matchEnd';

export type SimEvent =
  | { type: 'roundStart'; round: number }
  | { type: 'fight' }
  | {
      type: 'hit' | 'block' | 'guardBreak';
      attacker: 0 | 1;
      x: number;
      y: number;
      strength: number;
      combo: number;
    }
  | { type: 'ko'; winner: 0 | 1 | null }
  | { type: 'timeup'; winner: 0 | 1 | null }
  | { type: 'matchEnd'; winner: 0 | 1 };

export interface SimState {
  frame: number;
  match: number;
  round: number;
  phase: Phase;
  phaseFrame: number;
  /** Temps restant du round, en frames. */
  timer: number;
  /** Gel global après un impact. */
  hitstop: number;
  roundWinner: 0 | 1 | null;
  fighters: [FighterState, FighterState];
  events: SimEvent[];
}
