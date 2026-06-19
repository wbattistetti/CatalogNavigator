import { describe, expect, it } from 'vitest';
import { detectSeparator, parseTabularText, serializeTabularWithSeparator } from './parseTabular';

describe('detectSeparator', () => {
  it('prefers tab for TSV', () => {
    expect(detectSeparator('a\tb\tc')).toBe('\t');
  });

  it('prefers semicolon for European CSV', () => {
    expect(detectSeparator('col1;col2;col3')).toBe(';');
  });

  it('uses comma when semicolons are not dominant', () => {
    expect(detectSeparator('a,b,c')).toBe(',');
  });
});

describe('parseTabularText', () => {
  it('parses semicolon-separated CSV with headers', () => {
    const text = [
      'medicinale_veterinario;codice_aic;descrizione',
      'ANTIELMINTICO;102168010;4 BUSTE',
      'PORSILIS;102179037;FLACONE',
    ].join('\n');

    const parsed = parseTabularText(text);
    expect(parsed).not.toBeNull();
    expect(parsed!.headers).toEqual(['medicinale_veterinario', 'codice_aic', 'descrizione']);
    expect(parsed!.rows).toHaveLength(2);
    expect(parsed!.rows[0][0]).toBe('ANTIELMINTICO');
  });

  it('parses comma-separated CSV', () => {
    const text = 'name,age\nAlice,30\nBob,25';
    const parsed = parseTabularText(text);
    expect(parsed!.headers).toEqual(['name', 'age']);
    expect(parsed!.rows[0]).toEqual(['Alice', '30']);
  });

  it('returns null for single-column files', () => {
    expect(parseTabularText('only_one_column\nvalue')).toBeNull();
  });
});

describe('serializeTabularWithSeparator', () => {
  it('round-trips semicolon CSV', () => {
    const text = 'a;b\nc;d';
    const parsed = parseTabularText(text)!;
    expect(serializeTabularWithSeparator(parsed, ';')).toBe(text);
  });
});
