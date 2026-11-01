import { describe, expect, it } from 'vitest';
import { FixedStepAccumulator, STEP_MS } from '../src/core/loop';

describe('FixedStepAccumulator', () => {
  it('produit un pas par frame de 1/60 s', () => {
    const acc = new FixedStepAccumulator();
    expect(acc.advance(STEP_MS * 3 + 0.01).steps).toBe(3);
  });

  it('cumule les petits intervalles et expose le facteur d’interpolation', () => {
    const acc = new FixedStepAccumulator();
    const first = acc.advance(STEP_MS / 2);
    expect(first.steps).toBe(0);
    expect(first.alpha).toBeCloseTo(0.5);
    expect(acc.advance(STEP_MS / 2 + 0.01).steps).toBe(1);
  });

  it('ne rattrape pas une longue pause (onglet masqué)', () => {
    const acc = new FixedStepAccumulator();
    expect(acc.advance(10_000).steps).toBeLessThanOrEqual(15);
  });

  it('ignore un temps négatif', () => {
    expect(new FixedStepAccumulator().advance(-50).steps).toBe(0);
  });
});
