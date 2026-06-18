/**
 * Tests for ontology column resolution and corpus text building.
 */
import { describe, expect, it } from 'vitest';
import {
  buildCorpusDescriptionsFromColumns,
  buildRowOntologyText,
  resolveOntologyColumns,
  setOntologyColumnRoles,
} from './columnRoles';

describe('columnRoles ontology', () => {
  const headers = ['codice', 'descrizione', 'specialità', 'tipo'];

  it('resolveOntologyColumns prefers ontology role over legacy description', () => {
    const roles = {
      descrizione: 'description' as const,
      specialità: 'ontology' as const,
      tipo: 'ontology' as const,
    };
    expect(resolveOntologyColumns(headers, roles)).toEqual(['specialità', 'tipo']);
  });

  it('resolveOntologyColumns falls back to legacy description column', () => {
    const roles = { descrizione: 'description' as const };
    expect(resolveOntologyColumns(headers, roles)).toEqual(['descrizione']);
  });

  it('buildRowOntologyText joins non-empty selected columns', () => {
    const row = ['A001', 'visita', 'cardiologica', 'prima'];
    expect(buildRowOntologyText(row, headers, ['specialità', 'tipo'])).toBe('cardiologica prima');
    expect(buildRowOntologyText(row, headers, ['descrizione', 'specialità'])).toBe('visita cardiologica');
  });

  it('buildCorpusDescriptionsFromColumns maps all rows', () => {
    const rows = [
      ['A001', 'visita', 'cardiologica', 'prima'],
      ['A002', '', 'dermatologica', ''],
    ];
    const corpus = buildCorpusDescriptionsFromColumns(headers, rows, ['specialità', 'tipo']);
    expect(corpus).toEqual(['cardiologica prima', 'dermatologica']);
  });

  it('setOntologyColumnRoles assigns ontology and clears legacy description', () => {
    const roles = setOntologyColumnRoles(
      { descrizione: 'description', codice: 'data' },
      headers,
      ['specialità', 'tipo'],
    );
    expect(roles).toEqual({
      codice: 'data',
      specialità: 'ontology',
      tipo: 'ontology',
    });
  });
});
