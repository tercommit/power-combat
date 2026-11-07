import { describe, expect, it } from 'vitest';
import {
  FARM,
  applySave,
  createFarm,
  hitNode,
  nearestNode,
  resolveCollisions,
  tickFarm,
  toSave,
  upgradeCost,
  upgradeTool,
} from '../src/farm/state';

describe('mode récolte', () => {
  it('génère des arbres et des rochers hors de la clairière', () => {
    const farm = createFarm(42);
    expect(farm.nodes.filter((n) => n.kind === 'wood')).toHaveLength(FARM.treeCount);
    expect(farm.nodes.filter((n) => n.kind === 'stone')).toHaveLength(FARM.rockCount);
    for (const n of farm.nodes) expect(Math.hypot(n.x, n.z)).toBeGreaterThanOrEqual(FARM.clearing);
  });

  it('récolte du bois coup par coup, avec un bonus quand l’arbre tombe', () => {
    const farm = createFarm(1);
    const tree = farm.nodes.find((n) => n.kind === 'wood')!;
    let total = 0;
    let result;
    do {
      result = hitNode(farm, tree)!;
      total += result.gained;
    } while (!result.depleted);
    expect(farm.inventory.wood).toBe(total);
    expect(total).toBeGreaterThan(tree.maxHp);
    expect(hitNode(farm, tree)).toBeNull();
  });

  it('fait repousser les ressources après un délai', () => {
    const farm = createFarm(1);
    const rock = farm.nodes.find((n) => n.kind === 'stone')!;
    while (!hitNode(farm, rock)!.depleted);
    expect(tickFarm(farm, FARM.respawnSeconds.stone - 1)).toHaveLength(0);
    expect(tickFarm(farm, 1)).toContain(rock);
    expect(rock.hp).toBe(rock.maxHp);
  });

  it('améliore un outil contre des ressources', () => {
    const farm = createFarm(1);
    expect(upgradeTool(farm, 'wood')).toBe(false);
    const cost = upgradeCost('wood', 1)!;
    farm.inventory.wood = cost.wood;
    farm.inventory.stone = cost.stone;
    expect(upgradeTool(farm, 'wood')).toBe(true);
    expect(farm.tools.wood.level).toBe(2);
    expect(farm.inventory).toEqual({ wood: 0, stone: 0 });
    expect(upgradeCost('wood', FARM.maxToolLevel)).toBeNull();
  });

  it('trouve le nœud à portée et empêche de traverser les obstacles', () => {
    const farm = createFarm(1);
    const n = farm.nodes[0];
    expect(nearestNode(farm, n.x + 1, n.z)).toBe(n);
    const [x, z] = resolveCollisions(farm, n.x + 0.01, n.z);
    expect(Math.hypot(x - n.x, z - n.z)).toBeGreaterThan(0.3);
  });

  it('sauvegarde et restaure la progression en ignorant les valeurs invalides', () => {
    const farm = createFarm(1);
    farm.inventory.wood = 12;
    farm.tools.stone.level = 3;
    const other = createFarm(1);
    applySave(other, JSON.parse(JSON.stringify(toSave(farm))));
    expect(other.inventory.wood).toBe(12);
    expect(other.tools.stone.level).toBe(3);
    applySave(other, { tools: { wood: 99 }, inventory: { stone: 'x' } });
    expect(other.tools.wood.level).toBe(FARM.maxToolLevel);
    expect(other.inventory.stone).toBe(0);
  });
});
