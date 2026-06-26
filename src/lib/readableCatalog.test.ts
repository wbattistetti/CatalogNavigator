/**
 * Tests for readable catalog helpers.
 */
import { describe, expect, it } from 'vitest';
import {
  buildReadableCatalogRowsFromSegmentation,
  countPendingReadableCatalog,
  formatReadableLeafConfirmation,
  parseReadableCatalog,
  pruneReadableCatalog,
  readableCatalogKey,
  resolveReadableConfirmationForPath,
  resolveReadableConfirmationText,
  stripTrailingCatalogPath,
} from './readableCatalog';

describe('readableCatalog', () => {
  it('parses stored entries', () => {
    const parsed = parseReadableCatalog({
      'Visita cardiologica adulti': { text: 'Visita cardiologica adulti', status: 'approved' },
      bad: { nope: true },
    });
    expect(parsed).toEqual({
      'Visita cardiologica adulti': { text: 'Visita cardiologica adulti', status: 'approved' },
    });
  });

  it('prunes removed source lines and legacy paths', () => {
    const pruned = pruneReadableCatalog(
      {
        'Visita A': { text: 'A', status: 'approved' },
        'Visita B': { text: 'B', status: null },
        legacyPath: { text: 'Legacy', status: 'approved' },
      },
      ['Visita A'],
      ['legacyPath'],
    );
    expect(pruned).toEqual({
      'Visita A': { text: 'A', status: 'approved' },
      legacyPath: { text: 'Legacy', status: 'approved' },
    });
  });

  it('resolves confirmation by document line key with legacy path fallback', () => {
    const catalog = {
      [readableCatalogKey('Originale')]: { text: 'Leggibile', status: 'approved' as const },
    };
    expect(resolveReadableConfirmationText('p', 'Originale', catalog)).toBe('Leggibile');
    expect(resolveReadableConfirmationText('p', 'Originale', { p: { text: 'Via path', status: 'approved' } })).toBe('Via path');
    expect(resolveReadableConfirmationText('q', 'Altro', catalog)).toBe('Altro');
  });

  it('picks one readable line when legacy joined sourceText maps several corpus rows', () => {
    const catalog = {
      [readableCatalogKey('Visita A')]: { text: 'Leggibile A', status: 'approved' as const },
      [readableCatalogKey('Visita B')]: { text: 'Leggibile B', status: 'approved' as const },
    };
    expect(resolveReadableConfirmationText('controllo', 'Visita A; Visita B', catalog)).toBe('Leggibile A');
  });

  it('resolves one confirmation per path from segmentation rows', () => {
    const catalog = {
      [readableCatalogKey('VISITA + ECG')]: { text: 'Visita cardiologica con ECG', status: 'approved' as const },
      [readableCatalogKey('PRIMA VISITA ESCLUSO ECG')]: { text: 'Prima visita senza ECG', status: 'approved' as const },
    };
    const rows = [
      { path: 'cardiologica.prima.ecg', sourceText: 'VISITA + ECG' },
      { path: 'cardiologica.prima.ecg', sourceText: 'VISITA + ECG' },
      { path: 'cardiologica.prima.ecg', sourceText: 'PRIMA VISITA ESCLUSO ECG' },
    ];
    expect(resolveReadableConfirmationForPath('cardiologica.prima.ecg', rows, catalog)).toBe(
      'Visita cardiologica con ECG',
    );
    expect(
      resolveReadableConfirmationForPath('cardiologica.prima.ecg', rows, catalog),
    ).not.toContain(';');
  });

  it('builds one row per segmentation line even when paths collide', () => {
    const rows = buildReadableCatalogRowsFromSegmentation(
      [
        { path: 'controllo', sourceText: 'VISITA CHIRURGICA DI CONTROLLO' },
        { path: 'controllo', sourceText: 'VISITA OSTETRICA DI CONTROLLO' },
        { path: 'angiologica.controllo', sourceText: 'VISITA ANGIOLOGICA DI CONTROLLO' },
      ],
      null,
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]?.sourceText).toBe('VISITA CHIRURGICA DI CONTROLLO');
    expect(rows[1]?.sourceText).toBe('VISITA OSTETRICA DI CONTROLLO');
    expect(rows[2]?.path).toBe('angiologica.controllo');
    expect(countPendingReadableCatalog(rows)).toBe(3);
  });

  it('formats leaf confirmation with preamble and description only', () => {
    expect(formatReadableLeafConfirmation('a.b', 'Visita epatologica', null)).toBe(
      'Giusto per confermare, desidera prenotare: Visita epatologica',
    );
  });

  it('strips trailing path from confirmation description', () => {
    expect(stripTrailingCatalogPath('PRIMA VISITA EPATOLOGICA epatologica.prima', 'epatologica.prima')).toBe(
      'PRIMA VISITA EPATOLOGICA',
    );
  });
});
