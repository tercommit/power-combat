import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../src/characters';
import { buildCatalog, phaseAt } from '../src/modes/galleryCatalog';

describe('catalogue de la galerie', () => {
  for (const character of ['kai', 'brick'] as const) {
    const catalog = buildCatalog(character);

    it(`${character} : identifiants uniques et états valides sur toute la durée`, () => {
      const ids = catalog.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const entry of catalog) {
        for (let k = 0; k < entry.frames; k++) {
          expect(entry.stateAt(k).character).toBe(character);
        }
      }
    });

    it(`${character} : les phases des coups suivent les frame data`, () => {
      const hk = catalog.find((e) => e.id === 'hk')!;
      const move = CHARACTERS[character].moves.hk;
      expect(phaseAt(hk, 0)?.name).toBe('startup');
      expect(phaseAt(hk, move.startup)?.name).toBe('active');
      expect(phaseAt(hk, move.startup + move.active)?.name).toBe('recovery');
      expect(hk.stateAt(move.startup).action).toBe('attack');
      expect(hk.dummyDistance).toBe(move.reach);
    });
  }
});
