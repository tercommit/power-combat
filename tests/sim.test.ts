import { describe, expect, it } from 'vitest';
import { CPU_PROFILES, CpuController } from '../src/ai/cpu';
import { CHARACTERS } from '../src/characters';
import { frameFighters, CAMERA } from '../src/render/camera';
import { ARENA_HALF_WIDTH, MAX_GUARD, MAX_HP, createInitialState, stepSim } from '../src/sim/state';
import { NEUTRAL, type Intent, type SimEvent, type SimState } from '../src/sim/types';

const attack = (move: Intent['attack']): Intent => ({ move: 0, block: 'none', attack: move });
const block = (height: 'high' | 'low'): Intent => ({ move: 0, block: height, attack: null });

/** État en phase de combat, combattants placés à `distance` l'un de l'autre. */
function fightState(distance = 1): SimState {
  const s = createInitialState();
  s.phase = 'fight';
  s.fighters[0].x = -distance / 2;
  s.fighters[1].x = distance / 2;
  return s;
}

function run(s: SimState, frames: number, intents: (s: SimState) => [Intent, Intent]) {
  const events: SimEvent[] = [];
  for (let i = 0; i < frames; i++) {
    s = stepSim(s, intents(s));
    events.push(...s.events);
  }
  return { s, events };
}

describe('combat', () => {
  it('un jab à portée inflige ses dégâts et met en hitstun', () => {
    let s = stepSim(fightState(), [attack('lp'), NEUTRAL]);
    const { s: after, events } = run(s, 30, () => [NEUTRAL, NEUTRAL]);
    s = after;
    expect(events.filter((e) => e.type === 'hit')).toHaveLength(1);
    expect(s.fighters[1].hp).toBe(MAX_HP - CHARACTERS.kai.moves.lp.damage);
  });

  it('un coup hors de portée ne touche pas', () => {
    const s = stepSim(fightState(3), [attack('lp'), NEUTRAL]);
    const { events } = run(s, 30, () => [NEUTRAL, NEUTRAL]);
    expect(events.some((e) => e.type === 'hit')).toBe(false);
  });

  it('la garde haute bloque un coup haut et consomme la jauge de garde', () => {
    const s = stepSim(fightState(), [attack('lp'), block('high')]);
    const { s: after, events } = run(s, 30, () => [NEUTRAL, block('high')]);
    expect(events.some((e) => e.type === 'block')).toBe(true);
    expect(after.fighters[1].hp).toBe(MAX_HP);
    expect(after.fighters[1].guard).toBeLessThan(MAX_GUARD);
  });

  it('un coup bas passe sous la garde haute', () => {
    const s = stepSim(fightState(), [attack('lk'), block('high')]);
    const { events } = run(s, 30, () => [NEUTRAL, block('high')]);
    expect(events.some((e) => e.type === 'hit')).toBe(true);
  });

  it('la garde brisée survient quand la jauge tombe à zéro', () => {
    let s = fightState();
    s.fighters[1].guard = 5;
    s = stepSim(s, [attack('hp'), block('high')]);
    const { s: after, events } = run(s, 20, () => [NEUTRAL, block('high')]);
    expect(events.some((e) => e.type === 'guardBreak')).toBe(true);
    expect(after.fighters[1].action).toBe('guardBroken');
  });

  it('un KO termine le round et donne la victoire', () => {
    let s = fightState();
    s.fighters[1].hp = 10;
    s = stepSim(s, [attack('hp'), NEUTRAL]);
    const { s: after, events } = run(s, 30, () => [NEUTRAL, NEUTRAL]);
    expect(events).toContainEqual({ type: 'ko', winner: 0 });
    expect(after.fighters[0].wins).toBe(1);
    expect(after.fighters[1].action).toBe('ko');
  });

  it('les combattants ne se traversent pas et restent dans l’arène', () => {
    const { s } = run(fightState(2), 600, () => [
      { move: 1, block: 'none', attack: null },
      { move: 1, block: 'none', attack: null },
    ]);
    const [a, b] = s.fighters;
    expect(Math.abs(b.x - a.x)).toBeGreaterThanOrEqual(0.74);
    expect(a.x).toBeLessThan(b.x);
    expect(Math.abs(a.x)).toBeLessThanOrEqual(ARENA_HALF_WIDTH);
  });
});

describe('CPU vs CPU', () => {
  function playMatch(seed: number) {
    const cpus = [
      new CpuController(0, CPU_PROFILES.medium, seed),
      new CpuController(1, CPU_PROFILES.medium, seed + 1),
    ];
    let s = createInitialState();
    const events: SimEvent[] = [];
    for (let i = 0; i < 60 * 60 * 10 && s.match === 0; i++) {
      s = stepSim(s, [cpus[0].think(s), cpus[1].think(s)]);
      events.push(...s.events);
    }
    return { s, events };
  }

  it('est déterministe à graine égale', () => {
    expect(playMatch(42).events).toEqual(playMatch(42).events);
  });

  it('va au bout d’un match avec des coups, des gardes et un vainqueur', () => {
    const { events } = playMatch(7);
    expect(events.some((e) => e.type === 'hit')).toBe(true);
    expect(events.some((e) => e.type === 'block')).toBe(true);
    expect(events.some((e) => e.type === 'matchEnd')).toBe(true);
  });
});

describe('frameFighters', () => {
  it('se centre entre les deux combattants', () => {
    expect(frameFighters(-2, 4, 16 / 9).x).toBe(1);
  });

  it('recule quand les combattants s’éloignent, dans les bornes', () => {
    const near = frameFighters(-0.5, 0.5, 16 / 9).distance;
    const far = frameFighters(-6, 6, 16 / 9).distance;
    expect(far).toBeGreaterThan(near);
    expect(near).toBeGreaterThanOrEqual(CAMERA.minDistance);
    expect(far).toBeLessThanOrEqual(CAMERA.maxDistance);
  });
});
