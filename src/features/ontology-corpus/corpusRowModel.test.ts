import { describe, expect, it } from 'vitest';
import {
  buildCorpusRows,
  filterCorpusRows,
  parseCorpusFilterTerms,
} from './corpusRowModel';

describe('parseCorpusFilterTerms', () => {
  it('splits on whitespace and lowercases', () => {
    expect(parseCorpusFilterTerms('  ECG  Neonatale ')).toEqual(['ecg', 'neonatale']);
  });

  it('returns empty for blank query', () => {
    expect(parseCorpusFilterTerms('   ')).toEqual([]);
  });
});

describe('filterCorpusRows', () => {
  const rows = buildCorpusRows([
    'ecg da 0 fino a 1 anno neonatale',
    'ecg adulti cardiologica',
    'elettrocardiogramma neonatale',
    'rx torace',
  ]);

  it('matches a single term as substring', () => {
    const filtered = filterCorpusRows(rows, 'ecg');
    expect(filtered.map((r) => r.text)).toEqual([
      'ecg adulti cardiologica',
      'ecg da 0 fino a 1 anno neonatale',
    ]);
  });

  it('requires every term to match (AND)', () => {
    const filtered = filterCorpusRows(rows, 'ecg neonatale');
    expect(filtered.map((r) => r.text)).toEqual([
      'ecg da 0 fino a 1 anno neonatale',
    ]);
  });

  it('returns all rows when query is empty', () => {
    expect(filterCorpusRows(rows, '')).toHaveLength(rows.length);
  });

  it('returns no rows when a term is missing', () => {
    expect(filterCorpusRows(rows, 'ecg torace')).toHaveLength(0);
  });
});
