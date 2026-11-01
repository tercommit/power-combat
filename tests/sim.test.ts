import { describe, expect, it } from 'vitest';
import { frameFighters, CAMERA } from '../src/render/camera';
import { ARENA_HALF_WIDTH, createInitialState, stepSim } from '../src/sim/state';

describe('simulation', () => {
  it('est déterministe', () => {
    let a = createInitialState();
    let b = createInitialState();
    for (let i = 0; i < 600; i++) {
      a = stepSim(a);
      b = stepSim(b);
    }
    expect(a).toEqual(b);
  });

  it('garde les combattants dans l’arène et face à face', () => {
    let s = createInitialState();
    for (let i = 0; i < 3600; i++) {
      s = stepSim(s);
      const [p1, p2] = s.fighters;
      expect(Math.abs(p1.x)).toBeLessThanOrEqual(ARENA_HALF_WIDTH);
      expect(Math.abs(p2.x)).toBeLessThanOrEqual(ARENA_HALF_WIDTH);
      expect(p1.facing).toBe(p1.x <= p2.x ? 1 : -1);
      expect(p2.facing).toBe(-p1.facing);
    }
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
