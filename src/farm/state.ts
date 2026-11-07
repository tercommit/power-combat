/**
 * Logique du mode récolte, indépendante du rendu : inventaire, ressources,
 * outils et réapparition. Le temps est passé explicitement (en secondes).
 */
import { Rng } from '../core/rng';

export type ResourceKind = 'wood' | 'stone';

export interface ResourceNode {
  id: number;
  kind: ResourceKind;
  x: number;
  z: number;
  /** Taille visuelle (0.8 à 1.3) : les gros nœuds ont plus de vie et rapportent plus. */
  size: number;
  maxHp: number;
  hp: number;
  /** Instant (s) où le nœud réapparaît ; null s'il est sur pied. */
  respawnAt: number | null;
}

export interface Tool {
  level: number;
}

export interface FarmState {
  time: number;
  inventory: Record<ResourceKind, number>;
  /** Hache pour le bois, pioche pour la pierre. */
  tools: Record<ResourceKind, Tool>;
  nodes: ResourceNode[];
  /** Total récolté depuis le début (statistique). */
  harvested: Record<ResourceKind, number>;
}

export const FARM = {
  worldRadius: 24,
  /** Zone dégagée au centre, où apparaît le joueur. */
  clearing: 4,
  treeCount: 26,
  rockCount: 18,
  respawnSeconds: { wood: 20, stone: 30 } as Record<ResourceKind, number>,
  baseHp: { wood: 5, stone: 7 } as Record<ResourceKind, number>,
  reach: 1.7,
  maxToolLevel: 5,
} as const;

/** Nom des outils et des ressources, pour l'interface. */
export const LABELS = {
  wood: { resource: 'Bois', tool: 'Hache', icon: '🪵' },
  stone: { resource: 'Pierre', tool: 'Pioche', icon: '🪨' },
} as const;

export function createFarm(seed = 1): FarmState {
  const rng = new Rng(seed);
  const nodes: ResourceNode[] = [];
  const place = (kind: ResourceKind, count: number) => {
    let tries = 0;
    while (count > 0 && tries++ < 2000) {
      const angle = rng.next() * Math.PI * 2;
      const dist = FARM.clearing + Math.sqrt(rng.next()) * (FARM.worldRadius - FARM.clearing - 1);
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      if (nodes.some((n) => Math.hypot(n.x - x, n.z - z) < 2.4)) continue;
      const size = 0.8 + rng.next() * 0.5;
      const maxHp = Math.round(FARM.baseHp[kind] * size);
      nodes.push({ id: nodes.length, kind, x, z, size, maxHp, hp: maxHp, respawnAt: null });
      count--;
    }
  };
  place('wood', FARM.treeCount);
  place('stone', FARM.rockCount);
  return {
    time: 0,
    inventory: { wood: 0, stone: 0 },
    tools: { wood: { level: 1 }, stone: { level: 1 } },
    nodes,
    harvested: { wood: 0, stone: 0 },
  };
}

/** Dégâts infligés par coup selon le niveau de l'outil. */
export function toolDamage(level: number): number {
  return level;
}

/** Ressources gagnées par coup : 1, plus un bonus quand le nœud tombe. */
export function depletionBonus(node: ResourceNode): number {
  return Math.round(2 * node.size);
}

/** Coût pour passer l'outil au niveau suivant ; null si déjà au maximum. */
export function upgradeCost(
  kind: ResourceKind,
  level: number,
): Record<ResourceKind, number> | null {
  if (level >= FARM.maxToolLevel) return null;
  // On paie surtout avec l'autre ressource : il faut farmer les deux.
  const main = 10 * level * level;
  const other = 5 * level * level + 5;
  return kind === 'wood' ? { wood: main, stone: other } : { wood: other, stone: main };
}

export function canAfford(state: FarmState, cost: Record<ResourceKind, number>): boolean {
  return state.inventory.wood >= cost.wood && state.inventory.stone >= cost.stone;
}

/** Améliore l'outil si possible ; renvoie true en cas de succès. */
export function upgradeTool(state: FarmState, kind: ResourceKind): boolean {
  const cost = upgradeCost(kind, state.tools[kind].level);
  if (!cost || !canAfford(state, cost)) return false;
  state.inventory.wood -= cost.wood;
  state.inventory.stone -= cost.stone;
  state.tools[kind].level++;
  return true;
}

export interface HitResult {
  gained: number;
  depleted: boolean;
}

/** Frappe un nœud avec l'outil adapté. Renvoie null si le nœud est déjà tombé. */
export function hitNode(state: FarmState, node: ResourceNode): HitResult | null {
  if (node.respawnAt !== null) return null;
  const damage = Math.min(node.hp, toolDamage(state.tools[node.kind].level));
  node.hp -= damage;
  let gained = damage;
  const depleted = node.hp <= 0;
  if (depleted) {
    gained += depletionBonus(node);
    node.respawnAt = state.time + FARM.respawnSeconds[node.kind];
  }
  state.inventory[node.kind] += gained;
  state.harvested[node.kind] += gained;
  return { gained, depleted };
}

/** Avance le temps et fait repousser les nœuds dont le délai est écoulé. */
export function tickFarm(state: FarmState, dt: number): ResourceNode[] {
  state.time += dt;
  const respawned: ResourceNode[] = [];
  for (const node of state.nodes) {
    if (node.respawnAt !== null && state.time >= node.respawnAt) {
      node.respawnAt = null;
      node.hp = node.maxHp;
      respawned.push(node);
    }
  }
  return respawned;
}

/** Nœud sur pied le plus proche dans la portée, ou null. */
export function nearestNode(
  state: FarmState,
  x: number,
  z: number,
  reach: number = FARM.reach,
): ResourceNode | null {
  let best: ResourceNode | null = null;
  let bestDist = Infinity;
  for (const node of state.nodes) {
    if (node.respawnAt !== null) continue;
    const d = Math.hypot(node.x - x, node.z - z) - nodeRadius(node);
    if (d <= reach && d < bestDist) {
      best = node;
      bestDist = d;
    }
  }
  return best;
}

/** Rayon de collision d'un nœud. */
export function nodeRadius(node: ResourceNode): number {
  return (node.kind === 'wood' ? 0.35 : 0.7) * node.size;
}

/** Repousse une position hors des nœuds sur pied et des limites du monde. */
export function resolveCollisions(
  state: FarmState,
  x: number,
  z: number,
  radius = 0.35,
): [number, number] {
  for (const node of state.nodes) {
    if (node.respawnAt !== null) continue;
    const dx = x - node.x;
    const dz = z - node.z;
    const d = Math.hypot(dx, dz);
    const min = nodeRadius(node) + radius;
    if (d < min && d > 1e-6) {
      x = node.x + (dx / d) * min;
      z = node.z + (dz / d) * min;
    }
  }
  const r = Math.hypot(x, z);
  const limit = FARM.worldRadius - 0.5;
  if (r > limit) {
    x = (x / r) * limit;
    z = (z / r) * limit;
  }
  return [x, z];
}

/** Sauvegarde : inventaire et outils (le monde est régénéré à partir de la graine). */
export interface FarmSave {
  inventory: Record<ResourceKind, number>;
  tools: Record<ResourceKind, number>;
  harvested: Record<ResourceKind, number>;
}

export function toSave(state: FarmState): FarmSave {
  return {
    inventory: { ...state.inventory },
    tools: { wood: state.tools.wood.level, stone: state.tools.stone.level },
    harvested: { ...state.harvested },
  };
}

export function applySave(state: FarmState, save: unknown): void {
  if (!save || typeof save !== 'object') return;
  const s = save as Partial<FarmSave>;
  const num = (v: unknown, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : min;
  for (const kind of ['wood', 'stone'] as const) {
    state.inventory[kind] = num(s.inventory?.[kind], 0, 1e9);
    state.harvested[kind] = num(s.harvested?.[kind], 0, 1e9);
    state.tools[kind].level = num(s.tools?.[kind], 1, FARM.maxToolLevel);
  }
}
