/**
 * IA de récolte : elle vise l'amélioration d'outil la moins chère, farme la
 * ressource qui lui manque le plus pour la payer, puis achète l'amélioration.
 */
import {
  FARM,
  canAfford,
  upgradeCost,
  type FarmState,
  type ResourceKind,
  type ResourceNode,
} from './state';

export interface AiPlan {
  /** Outil que l'IA veut améliorer, ou null quand tout est au maximum. */
  upgrade: ResourceKind | null;
  /** Ressource à farmer maintenant. */
  need: ResourceKind;
}

const KINDS: ResourceKind[] = ['wood', 'stone'];

export function planFarm(state: FarmState): AiPlan {
  let best: { kind: ResourceKind; total: number } | null = null;
  for (const kind of KINDS) {
    const cost = upgradeCost(kind, state.tools[kind].level);
    if (!cost) continue;
    const total = cost.wood + cost.stone;
    if (!best || total < best.total) best = { kind, total };
  }
  if (!best) {
    // Tout est au maximum : on équilibre les stocks.
    return {
      upgrade: null,
      need: state.inventory.wood <= state.inventory.stone ? 'wood' : 'stone',
    };
  }
  const cost = upgradeCost(best.kind, state.tools[best.kind].level)!;
  const missing = (k: ResourceKind) => Math.max(0, cost[k] - state.inventory[k]);
  const need = missing('wood') >= missing('stone') ? 'wood' : 'stone';
  return { upgrade: best.kind, need };
}

/** Amélioration à acheter tout de suite, si l'IA en a les moyens. */
export function affordableUpgrade(state: FarmState): ResourceKind | null {
  const { upgrade } = planFarm(state);
  if (!upgrade) return null;
  const cost = upgradeCost(upgrade, state.tools[upgrade].level)!;
  return canAfford(state, cost) ? upgrade : null;
}

/**
 * Choisit la ressource à récolter : la plus proche du type voulu (à défaut,
 * de l'autre type), en évitant les nœuds où l'IA vient de rester bloquée.
 */
export function chooseTarget(
  state: FarmState,
  x: number,
  z: number,
  avoid: ReadonlySet<number> = new Set(),
): ResourceNode | null {
  const { need } = planFarm(state);
  const standing = state.nodes.filter((n) => n.respawnAt === null && !avoid.has(n.id));
  const pool = standing.some((n) => n.kind === need)
    ? standing.filter((n) => n.kind === need)
    : standing;
  let best: ResourceNode | null = null;
  let bestScore = Infinity;
  for (const n of pool) {
    // Un nœud déjà entamé vaut le détour : il tombera plus vite.
    const score = Math.hypot(n.x - x, n.z - z) + (n.hp / n.maxHp) * 2;
    if (score < bestScore) {
      best = n;
      bestScore = score;
    }
  }
  return best;
}

export const AI = {
  /** Temps sans progresser vers la cible avant d'en changer (s). */
  stuckSeconds: 1.2,
  /** Durée pendant laquelle une cible abandonnée est évitée (s). */
  avoidSeconds: 8,
  reach: FARM.reach,
} as const;
