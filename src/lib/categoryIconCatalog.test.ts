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
    expect(resolveCategoryIcon('specialità').iconKey).toBe('Puzzle');
    expect(resolveCategoryIcon('visite').iconKey).toBe('Stethoscope');
    expect(resolveCategoryIcon('tipo visita').iconKey).toBe('ClipboardList');
    expect(resolveCategoryIcon('esami').iconKey).toBe('FlaskConical');
    expect(resolveCategoryIcon('fascia di età').iconKey).toBe('AgeGrowth');
    expect(resolveCategoryIcon('fasce di età').iconKey).toBe('AgeGrowth');
    expect(resolveCategoryIcon('organo').iconKey).toBe('Heart');
    expect(resolveCategoryIcon('posizione').iconKey).toBe('ArrowLeftRight');
    expect(resolveCategoryIcon('anatomia').iconKey).toBe('Layers');
    expect(resolveCategoryIcon('parte del corpo').iconKey).toBe('PersonStanding');
  });

  it('assigns distinct accent colors per category family', () => {
    expect(resolveCategoryIcon('esami').iconColor).toBe('#22d3ee');
    expect(resolveCategoryIcon('specialità').iconColor).toBe('#a78bfa');
    expect(resolveCategoryIcon('tipo visita').iconColor).toBe('#38bdf8');
    expect(resolveCategoryIcon('fascia di età').iconColor).toBe('#fcd34d');
    expect(resolveCategoryIcon('parte del corpo').iconColor).toBe('#818cf8');
  });

  it('falls back to Folder for unknown names', () => {
    expect(resolveCategoryIcon('categoria sconosciuta').iconKey).toBe('Folder');
  });

  it('maps pharmaceutical category containers', () => {
    expect(resolveCategoryIcon('Principio attivo').iconKey).toBe('FlaskConical');
    expect(resolveCategoryIcon('Nome commerciale').iconKey).toBe('Tag');
    expect(resolveCategoryIcon('Forma di confezionamento').iconKey).toBe('Package');
    expect(resolveCategoryIcon('Dosaggio / concentrazione').iconKey).toBe('Scale');
    expect(resolveCategoryIcon('Quantità confezione').iconKey).toBe('Boxes');
    expect(resolveCategoryIcon('Indicazione clinica').iconKey).toBe('FileText');
    expect(resolveCategoryIcon('Vincoli / controindicazioni').iconKey).toBe('ShieldAlert');
    expect(resolveCategoryIcon('Modalità di somministrazione').iconKey).toBe('Syringe');
    expect(resolveCategoryIcon('Stabilità e conservazione').iconKey).toBe('Snowflake');
    expect(resolveCategoryIcon('Interazioni farmacologiche rilevanti').iconKey).toBe('Link2');
  });
});

describe('resolveTokenIcon', () => {
  const categories: TokenCategory[] = [
    {
      id: 'c1',
      name: 'esami',
      order: 0,
      tokenTexts: ['emocromo', 'esame generico'],
      iconKey: 'FlaskConical',
      iconColor: '#f59e0b',
    },
    {
      id: 'c2',
      name: 'organo',
      order: 1,
      tokenTexts: ['cuore', 'aorta'],
      iconKey: 'Heart',
      iconColor: '#f472b6',
    },
    {
      id: 'c3',
      name: 'posizione',
      order: 2,
      tokenTexts: ['sinistra', 'completo'],
      iconKey: 'ArrowLeftRight',
      iconColor: '#a3e635',
    },
    {
      id: 'c4',
      name: 'tipo visita',
      order: 3,
      tokenTexts: ['prima visita', 'visita di controllo'],
      iconKey: 'ClipboardList',
      iconColor: '#38bdf8',
    },
    {
      id: 'c5',
      name: 'parte del corpo',
      order: 4,
      tokenTexts: ['braccio', 'gamba', 'spalla'],
      iconKey: 'PersonStanding',
      iconColor: '#818cf8',
    },
  ];

  it('uses catalog token icon before parent category', () => {
    expect(resolveTokenIcon(categories, 'emocromo').iconKey).toBe('Droplet');
    expect(resolveTokenIcon(categories, 'ecocardiogramma').iconKey).toBe('HeartPulse');
  });

  it('inherits icon from parent category when token has no catalog entry', () => {
    expect(resolveTokenIcon(categories, 'esame generico').iconKey).toBe('FlaskConical');
  });

  it('maps healthcare tokens for organi, posizione e visite', () => {
    expect(resolveTokenIcon(categories, 'cuore').iconKey).toBe('Heart');
    expect(resolveTokenIcon(categories, 'aorta').iconKey).toBe('HeartPulse');
    expect(resolveTokenIcon(categories, 'sinistra').iconKey).toBe('ArrowLeft');
    expect(resolveTokenIcon(categories, 'completo').iconKey).toBe('Maximize2');
    expect(resolveTokenIcon(categories, 'prima visita').iconKey).toBe('CalendarPlus');
    expect(resolveTokenIcon(categories, 'visita di controllo').iconKey).toBe('RefreshCw');
    expect(resolveTokenIcon(categories, 'braccio').iconKey).toBe('PersonStanding');
    expect(resolveTokenIcon(categories, 'gamba').iconKey).toBe('PersonStanding');
    expect(resolveTokenIcon(categories, 'spalla').iconKey).toBe('PersonStanding');
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
