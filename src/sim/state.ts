/**
 * État de la simulation. Pur et déterministe : stepSim(état) donne toujours le
 * même résultat, sans dépendre du temps réel ni du rendu.
 */

export type Facing = 1 | -1;

export interface FighterState {
  /** Position sur le plan de combat (mètres). */
  x: number;
  y: number;
  /** 1 = regarde vers +x, -1 = regarde vers -x. */
  facing: Facing;
}

export interface SimState {
  frame: number;
  fighters: [FighterState, FighterState];
}

/** Demi-largeur jouable de l'arène (murs invisibles). */
export const ARENA_HALF_WIDTH = 6;
const START_X = 1.5;

export function createInitialState(): SimState {
  return {
    frame: 0,
    fighters: [
      { x: -START_X, y: 0, facing: 1 },
      { x: START_X, y: 0, facing: -1 },
    ],
  };
}

export function stepSim(prev: SimState): SimState {
  const frame = prev.frame + 1;
  // Placeholder M0 : mouvement de démo pour vérifier caméra et interpolation.
  // Remplacé par les entrées joueurs en M1/M2.
  const t = frame / 60;
  const center = Math.sin(t * 0.35) * 2.5;
  const spread = 1.2 + (Math.sin(t * 0.8) + 1) * 1.6;
  const x1 = clampToArena(center - spread);
  const x2 = clampToArena(center + spread);
  return {
    frame,
    fighters: [
      { x: x1, y: 0, facing: x1 <= x2 ? 1 : -1 },
      { x: x2, y: 0, facing: x2 < x1 ? 1 : -1 },
    ],
  };
}

function clampToArena(x: number): number {
  return Math.min(Math.max(x, -ARENA_HALF_WIDTH), ARENA_HALF_WIDTH);
}
