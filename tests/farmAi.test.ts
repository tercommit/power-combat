import { describe, expect, it } from 'vitest';
import { affordableUpgrade, chooseTarget, planFarm } from '../src/farm/ai';
import { FARM, createFarm, hitNode, upgradeCost } from '../src/farm/state';

describe('IA de récolte', () => {
  it('farme la ressource qui manque pour la prochaine amélioration', () => {
    const farm = createFarm(1);
    const plan = planFarm(farm);
    expect(plan.upgrade).not.toBeNull();
    const cost = upgradeCost(plan.upgrade!, 1)!;
    farm.inventory[plan.need] = cost[plan.need];
    expect(planFarm(farm).need).not.toBe(plan.need);
  });

  it('achète l’amélioration dès qu’elle est payable', () => {
    const farm = createFarm(1);
    expect(affordableUpgrade(farm)).toBeNull();
    farm.inventory = { wood: 1000, stone: 1000 };
    expect(affordableUpgrade(farm)).not.toBeNull();
  });

  it('va vers le nœud du bon type le plus proche et ignore ceux à éviter', () => {
    const farm = createFarm(1);
    const { need } = planFarm(farm);
    const target = chooseTarget(farm, 0, 0)!;
    expect(target.kind).toBe(need);
    expect(chooseTarget(farm, 0, 0, new Set([target.id]))).not.toBe(target);
  });

  it('se rabat sur l’autre ressource quand tout le type voulu est tombé', () => {
    const farm = createFarm(1);
    const { need } = planFarm(farm);
    for (const n of farm.nodes.filter((n) => n.kind === need)) while (!hitNode(farm, n)!.depleted);
    expect(chooseTarget(farm, 0, 0)!.kind).not.toBe(need);
  });

  it('équilibre les stocks une fois les outils au maximum', () => {
    const farm = createFarm(1);
    farm.tools.wood.level = FARM.maxToolLevel;
    farm.tools.stone.level = FARM.maxToolLevel;
    farm.inventory = { wood: 5, stone: 50 };
    expect(planFarm(farm)).toEqual({ upgrade: null, need: 'wood' });
  });
});
