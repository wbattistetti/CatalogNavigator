/**
 * Tests for catalog path resolution in dialog test plan.
 */
import { describe, expect, it } from 'vitest';
import { resolveCatalogTargetPath } from './dialogTestPlanResolvePath';

const categories = [
  { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['cardiologica'] },
  { id: 'c2', name: 'tipo', order: 1, tokenTexts: ['prima visita'] },
];

describe('resolveCatalogTargetPath', () => {
  it('matches exact and canonical paths', () => {
    const paths = ['cardiologica.prima visita'];
    expect(resolveCatalogTargetPath('cardiologica.prima visita', paths, categories).inCatalog).toBe(true);
  });

  it('matches when segment order differs but tokens are the same', () => {
    const paths = ['cardiologica.prima visita'];
    const resolved = resolveCatalogTargetPath('prima visita.cardiologica', paths, categories);
    expect(resolved.inCatalog).toBe(true);
    expect(resolved.path).toBe('cardiologica.prima visita');
  });
});
