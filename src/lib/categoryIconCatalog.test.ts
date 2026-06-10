/**
 * Tests for pre-built category/token icon catalog lookups.
 */
import { describe, expect, it } from 'vitest';
import {
  categoryNameForToken,
  enrichCategoryIcons,
  formatChipTooltipTitle,
  normalizeIconLabel,
  resolveCategoryIcon,
  resolveTokenIcon,
} from './categoryIconCatalog';
import type { TokenCategory } from './dictionaryTree';

describe('normalizeIconLabel', () => {
  it('lowercases, trims and strips accents', () => {
    expect(normalizeIconLabel('  Fascia di Età  ')).toBe('fascia di eta');
  });
});

describe('resolveCategoryIcon', () => {
  it('maps known healthcare category containers', () => {
    expect(resolveCategoryIcon('specialità').iconKey).toBe('Building2');
    expect(resolveCategoryIcon('tipo visita').iconKey).toBe('ClipboardList');
    expect(resolveCategoryIcon('esami').iconKey).toBe('FlaskConical');
    expect(resolveCategoryIcon('fascia di età').iconKey).toBe('Users');
  });

  it('assigns distinct accent colors per category family', () => {
    expect(resolveCategoryIcon('esami').iconColor).toBe('#22d3ee');
    expect(resolveCategoryIcon('specialità').iconColor).toBe('#a78bfa');
    expect(resolveCategoryIcon('tipo visita').iconColor).toBe('#38bdf8');
    expect(resolveCategoryIcon('fascia di età').iconColor).toBe('#fcd34d');
  });

  it('falls back to Folder for unknown names', () => {
    expect(resolveCategoryIcon('categoria sconosciuta').iconKey).toBe('Folder');
  });
});

describe('resolveTokenIcon', () => {
  const categories: TokenCategory[] = [
    {
      id: 'c1',
      name: 'esami',
      order: 0,
      tokenTexts: ['emocromo'],
      iconKey: 'FlaskConical',
      iconColor: '#f59e0b',
    },
  ];

  it('inherits icon from parent category', () => {
    expect(resolveTokenIcon(categories, 'emocromo').iconKey).toBe('FlaskConical');
  });

  it('uses no-category icon for uncategorized tokens', () => {
    expect(resolveTokenIcon(categories, 'cardiologia').iconKey).toBe('Folder');
    expect(resolveTokenIcon(categories, 'cardiologia').iconColor).toBe('#34d399');
  });
});

describe('categoryNameForToken', () => {
  const categories: TokenCategory[] = [
    { id: 'c1', name: 'esami', order: 0, tokenTexts: ['emocromo'] },
  ];

  it('returns category name when token is categorized', () => {
    expect(categoryNameForToken('emocromo', categories)).toBe('esami');
  });

  it('returns no category for root tokens', () => {
    expect(categoryNameForToken('orfano', categories)).toBe('no category');
  });
});

describe('formatChipTooltipTitle', () => {
  it('uses Project prefix for project scope', () => {
    expect(formatChipTooltipTitle('project', 'My Dict', 'esami')).toBe('Project - esami');
  });

  it('uses dictionary name for library scope', () => {
    expect(formatChipTooltipTitle('library', 'Sanità base', 'specialità')).toBe(
      'Sanità base - specialità',
    );
  });
});

describe('enrichCategoryIcons', () => {
  it('assigns icon fields when missing', () => {
    const enriched = enrichCategoryIcons({
      id: 'x',
      name: 'visita',
      order: 0,
      tokenTexts: [],
    });
    expect(enriched.iconKey).toBe('Stethoscope');
    expect(enriched.iconColor).toBe('#fb7185');
  });

  it('preserves stored icons', () => {
    const enriched = enrichCategoryIcons({
      id: 'x',
      name: 'custom',
      order: 0,
      tokenTexts: [],
      iconKey: 'Brain',
      iconColor: '#fff',
    });
    expect(enriched.iconKey).toBe('Brain');
    expect(enriched.iconColor).toBe('#fff');
  });
});
