/**
 * Catalogue de la galerie : chaque animation est décrite comme une suite d'états
 * de simulation, rendus par le même code que le combat. Les identifiants
 * (« kai/lk », « brick/block_low »…) servent de référence pour demander une retouche.
 */
import { CHARACTERS } from '../characters';
import { createInitialState } from '../sim/state';
import type { CharacterId, FighterState, MoveData, MoveId } from '../sim/types';

export type Group = 'Postures' | 'Coups' | 'Réactions';

export interface Phase {
  name: 'startup' | 'active' | 'recovery';
  from: number;
  to: number;
}

export interface GalleryEntry {
  id: string;
  label: string;
  group: Group;
  /** Durée de lecture, en frames (60 par seconde). */
  frames: number;
  move?: MoveData;
  phases: Phase[];
  /** Placement du mannequin cible (distance de centre à centre). */
  dummyDistance: number;
  stateAt(frame: number): FighterState;
}

const MOVE_IDS: MoveId[] = ['lp', 'hp', 'lk', 'hk'];
const MOVE_LABELS: Record<MoveId, string> = {
  lp: 'Poing léger',
  hp: 'Poing lourd',
  lk: 'Pied léger',
  hk: 'Pied lourd',
};
/** Temps de garde ajouté après un coup, pour voir le retour en position. */
const ATTACK_PADDING = 20;

function fighter(character: CharacterId, patch: Partial<FighterState>): FighterState {
  return { ...createInitialState().fighters[0], character, x: 0, facing: 1, ...patch };
}

export function buildCatalog(character: CharacterId): GalleryEntry[] {
  const c = CHARACTERS[character];
  const simple = (
    id: string,
    label: string,
    group: Group,
    frames: number,
    stateAt: (k: number) => Partial<FighterState>,
  ): GalleryEntry => ({
    id,
    label,
    group,
    frames,
    phases: [],
    dummyDistance: 1.2,
    stateAt: (k) => fighter(character, stateAt(k)),
  });

  const attacks = MOVE_IDS.map((id): GalleryEntry => {
    const move = c.moves[id];
    const total = move.startup + move.active + move.recovery;
    return {
      id,
      label: `${move.name} (${MOVE_LABELS[id]})`,
      group: 'Coups',
      frames: total + ATTACK_PADDING,
      move,
      phases: [
        { name: 'startup', from: 0, to: move.startup },
        { name: 'active', from: move.startup, to: move.startup + move.active },
        { name: 'recovery', from: move.startup + move.active, to: total },
      ],
      dummyDistance: move.reach,
      stateAt: (k) =>
        fighter(
          character,
          k < total
            ? { action: 'attack', move: id, actionFrame: k, moveHit: false }
            : { action: 'idle', actionFrame: k - total },
        ),
    };
  });

  const stun = (k: number, duration: number) => (k < duration ? k : duration);
  return [
    simple('idle', 'Garde', 'Postures', 150, (k) => ({ action: 'idle', actionFrame: k })),
    simple('walk_fwd', 'Marche avant', 'Postures', 120, () => ({ action: 'walk', walkDir: 1 })),
    simple('walk_back', 'Marche arrière', 'Postures', 120, () => ({ action: 'walk', walkDir: -1 })),
    simple('block_high', 'Garde haute', 'Postures', 90, () => ({
      action: 'block',
      blockHeight: 'high',
    })),
    simple('block_low', 'Garde basse', 'Postures', 90, () => ({
      action: 'block',
      blockHeight: 'low',
    })),
    ...attacks,
    simple('hit_high', 'Touché en haut', 'Réactions', 40, (k) =>
      k < 20
        ? {
            action: 'hitstun',
            hitHeight: 'high',
            stun: 20,
            actionFrame: stun(k, 20),
            comboTaken: 1,
            flash: k < 4 ? 1 : 0,
          }
        : { action: 'idle' },
    ),
    simple('hit_mid', 'Touché au corps', 'Réactions', 40, (k) =>
      k < 20
        ? {
            action: 'hitstun',
            hitHeight: 'mid',
            stun: 20,
            actionFrame: stun(k, 20),
            comboTaken: 1,
            flash: k < 4 ? 1 : 0,
          }
        : { action: 'idle' },
    ),
    simple('guard_broken', 'Garde brisée', 'Réactions', 90, (k) =>
      k < 60 ? { action: 'guardBroken', stun: 60, actionFrame: k } : { action: 'idle' },
    ),
    simple('ko', 'K.O.', 'Réactions', 150, (k) => ({ action: 'ko', actionFrame: k })),
    simple('victory', 'Victoire', 'Réactions', 120, (k) => ({ action: 'victory', actionFrame: k })),
  ];
}

/** Phase de l'attaque à une frame donnée (ou null hors attaque). */
export function phaseAt(entry: GalleryEntry, frame: number): Phase | null {
  return entry.phases.find((p) => frame >= p.from && frame < p.to) ?? null;
}
