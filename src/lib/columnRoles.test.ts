/**
 * Tests for column role resolution and corpus text building.
 */
import { describe, expect, it } from 'vitest';
import {
  buildCorpusDescriptionsFromColumns,
  buildRowOntologyText,
  buildSelectorLeafPaths,
  corpusUsesSelectorFallback,
  hasSelectorColumn,
  resolveCorpusColumns,
  resolveDataColumns,
  resolveDescriptionColumns,
  resolveSelectorColumns,
  setOntologyColumnRoles,
  shouldShowOntologyTab,
} from './columnRoles';

describe('columnRoles', () => {
  const headers = ['codice', 'descrizione', 'specialità', 'tipo', 'prezzo'];

  it('hasSelectorColumn is true when any selector role exists', () => {
    expect(hasSelectorColumn({ specialità: 'selector' })).toBe(true);
    expect(hasSelectorColumn({ descrizione: 'description' })).toBe(false);
  });

  it('shouldShowOntologyTab opens for selector, description, or saved ontology', () => {
    expect(shouldShowOntologyTab(headers, { specialità: 'selector' })).toBe(true);
    expect(shouldShowOntologyTab(headers, { descrizione: 'description' })).toBe(true);
    expect(shouldShowOntologyTab(headers, { descrizione: 'ontology' })).toBe(true);
    expect(shouldShowOntologyTab(headers, {}, { hasSavedTaxonomy: true })).toBe(true);
    expect(shouldShowOntologyTab(headers, {}, { hasTokenDictionary: true })).toBe(true);
    expect(shouldShowOntologyTab(headers, {})).toBe(false);
  });

  it('resolveCorpusColumns falls back to selector when no description', () => {
    const roles = {
      specialità: 'selector' as const,
      tipo: 'selector' as const,
    };
    expect(resolveCorpusColumns(headers, roles)).toEqual(['specialità', 'tipo']);
    expect(corpusUsesSelectorFallback(headers, roles)).toBe(true);
  });

  it('resolveCorpusColumns prefers description over selector', () => {
    const roles = {
      descrizione: 'description' as const,
      specialità: 'selector' as const,
    };
    expect(resolveCorpusColumns(headers, roles)).toEqual(['descrizione']);
    expect(corpusUsesSelectorFallback(headers, roles)).toBe(false);
  });

  it('resolveDescriptionColumns uses description and legacy ontology roles', () => {
    const roles = {
      descrizione: 'description' as const,
      specialità: 'ontology' as const,
      tipo: 'selector' as const,
    };
    expect(resolveDescriptionColumns(headers, roles)).toEqual(['descrizione', 'specialità']);
  });

  it('resolveSelectorColumns and resolveDataColumns', () => {
    const roles = {
      specialità: 'selector' as const,
      tipo: 'selector' as const,
      codice: 'data' as const,
      prezzo: 'data' as const,
    };
    expect(resolveSelectorColumns(headers, roles)).toEqual(['specialità', 'tipo']);
    expect(resolveDataColumns(headers, roles)).toEqual(['codice', 'prezzo']);
  });

  it('buildRowOntologyText joins non-empty description columns', () => {
    const row = ['A001', 'visita', 'cardiologica', 'prima', '50'];
    expect(buildRowOntologyText(row, headers, ['specialità', 'tipo'])).toBe('cardiologica prima');
    expect(buildRowOntologyText(row, headers, ['descrizione', 'specialità'])).toBe('visita cardiologica');
  });

  it('buildCorpusDescriptionsFromColumns maps all rows', () => {
    const rows = [
      ['A001', 'visita', 'cardiologica', 'prima', '50'],
      ['A002', '', 'dermatologica', '', '30'],
    ];
    const corpus = buildCorpusDescriptionsFromColumns(headers, rows, ['descrizione']);
    expect(corpus).toEqual(['visita', '']);
  });

  it('buildSelectorLeafPaths returns paths from selector columns', () => {
    const tabular = {
      headers: ['specialità', 'tipo', 'prezzo'],
      rows: [
        ['cardiologica', 'prima', '50'],
        ['cardiologica', 'seconda', '60'],
        ['dermatologica', 'prima', '30'],
      ],
    };
    const roles = {
      specialità: 'selector' as const,
      tipo: 'selector' as const,
      prezzo: 'data' as const,
    };
    const { leafPaths } = buildSelectorLeafPaths(tabular, roles);
    expect(leafPaths).toContain('cardiologica.prima');
    expect(leafPaths).toContain('cardiologica.seconda');
    expect(leafPaths).toContain('dermatologica.prima');
  });

  it('setOntologyColumnRoles assigns description (deprecated helper)', () => {
    const roles = setOntologyColumnRoles(
      { descrizione: 'description', codice: 'data' },
      headers,
      ['specialità', 'tipo'],
    );
    expect(roles).toEqual({
      codice: 'data',
      specialità: 'description',
      tipo: 'description',
    });
  });
});
