/**
 * Unit tests for pharma dictionary refactor parsers.
 */
import { describe, expect, it } from 'vitest';
import {
  decomposePackagingPhrase,
  extractBrandName,
  parseWeightBand,
  purifyBrandSourceToken,
  purifyGalenicSourceToken,
} from './decompose';
import { refactorTokenCategoryMap, splitCanonicalAndAliases } from './refactorCheckpoint';

describe('extractBrandName', () => {
  it('extracts BAYTRIL from extended commercial name', () => {
    const { brand } = extractBrandName('BAYTRIL 10% O.L.');
    expect(brand).toBe('BAYTRIL');
  });

  it('keeps short brand unchanged', () => {
    const { brand } = extractBrandName('BENAKOR');
    expect(brand).toBe('BENAKOR');
  });

  it('extracts EFFIPRO from spot-on catalog line', () => {
    const { brand } = extractBrandName('EFFIPRO 50MG SOLUZIONE SPOT ON PER GATTI');
    expect(brand).toBe('EFFIPRO');
  });

  it('extracts FRONTLINE TRI ACT without species suffix', () => {
    const { brand } = extractBrandName('FRONTLINE TRI ACT SPOT CANI DA 40 KG A 60 KG (A.I.P.)');
    expect(brand).toBe('FRONTLINE TRI ACT');
  });

  it('extracts DINALGEN before dosage', () => {
    const { brand } = extractBrandName('DINALGEN 300 MG/ML - SOLUZIONE ORALE');
    expect(brand).toBe('DINALGEN');
  });
});

describe('parseWeightBand', () => {
  it('normalizes weight range', () => {
    expect(parseWeightBand('cani di peso da 4 kg a 10 kg')).toBe('4–10 kg');
  });

  it('parses da X kg a Y kg without peso keyword', () => {
    expect(parseWeightBand('CANI DA 40 KG A 60 KG')).toBe('40–60 kg');
  });

  it('returns null for species without weight', () => {
    expect(parseWeightBand('cani')).toBeNull();
  });
});

describe('purifyBrandSourceToken', () => {
  it('splits EFFIPRO spot-on monolith into brand + attributes', () => {
    const { tokens } = purifyBrandSourceToken('EFFIPRO 50MG SOLUZIONE SPOT ON PER GATTI');
    expect(tokens.some((t) => t.text === 'EFFIPRO' && t.category === 'Nome commerciale')).toBe(true);
    expect(tokens.some((t) => t.category === 'Dosaggio / concentrazione')).toBe(true);
    expect(tokens.some((t) => t.text === 'gatti' && t.category === 'Target paziente / fascia di età')).toBe(true);
  });

  it('splits DINALGEN injectable line', () => {
    const { tokens } = purifyBrandSourceToken(
      'DINALGEN 150 MG/ML SOLUZIONE INIETTABILE BOVINI SUINI CAVALLI',
    );
    expect(tokens.some((t) => t.text === 'DINALGEN' && t.category === 'Nome commerciale')).toBe(true);
    expect(tokens.some((t) => t.category === 'Dosaggio / concentrazione')).toBe(true);
    expect(tokens.some((t) => t.text === 'bovini')).toBe(true);
  });

  it('splits FRONTLINE weight bands and regime', () => {
    const { tokens } = purifyBrandSourceToken(
      'FRONTLINE TRI ACT SPOT CANI DA 40 KG A 60 KG (A.I.P.)',
    );
    expect(tokens.some((t) => t.text === 'FRONTLINE TRI ACT' && t.category === 'Nome commerciale')).toBe(true);
    expect(tokens.some((t) => t.text === '40–60 kg' && t.category === 'Fascia di peso')).toBe(true);
    expect(tokens.some((t) => t.text === 'A.I.P.' && t.category === 'Regime di prescrizione')).toBe(true);
  });

  it('keeps product line EFFIPRO DUO as brand', () => {
    const { tokens } = purifyBrandSourceToken('EFFIPRO DUO GATTI');
    expect(tokens.some((t) => t.text === 'EFFIPRO DUO' && t.category === 'Nome commerciale')).toBe(true);
    expect(tokens.some((t) => t.text === 'gatti')).toBe(true);
  });
});

describe('decomposePackagingPhrase', () => {
  it('splits blister packaging monolith', () => {
    const { tokens, aliases } = decomposePackagingPhrase('1 blister da 10 compresse');
    const categories = tokens.map((t) => t.category);
    expect(categories).toContain('Tipo contenitore');
    expect(categories).toContain('Quantità confezione');
    expect(aliases).toHaveLength(0);
  });

  it('splits barattolo with dosage and net weight without container alias', () => {
    const { tokens, aliases } = decomposePackagingPhrase('100 mg/g barattolo da 1 kg');
    expect(tokens.some((t) => t.text === 'barattolo' && t.category === 'Tipo contenitore')).toBe(true);
    expect(tokens.some((t) => t.category === 'Dosaggio / concentrazione')).toBe(true);
    expect(tokens.some((t) => t.category === 'Quantità confezione')).toBe(true);
    expect(aliases).toHaveLength(0);
  });

  it('splits liofil kit', () => {
    const { tokens } = decomposePackagingPhrase(
      '1 flaconcino di liofilizzato + 1 flacone da 5 ml di solvente + 1 contagocce',
    );
    expect(tokens.some((t) => t.category === 'Configurazione kit')).toBe(true);
    expect(tokens.some((t) => t.text === 'flaconcino')).toBe(true);
  });
});

describe('purifyGalenicSourceToken', () => {
  it('splits compresse appetibili monolith into forma, quantità, dosaggio', () => {
    const { tokens } = purifyGalenicSourceToken('10 compresse appetibili da 250 mg');
    expect(tokens).toEqual([
      { text: 'compresse appetibili', category: 'Forma farmaceutica' },
      { text: '10 compresse', category: 'Quantità confezione' },
      { text: '250 mg', category: 'Dosaggio / concentrazione' },
    ]);
  });

  it('keeps pure galenic form as single token', () => {
    const { tokens } = purifyGalenicSourceToken('compresse appetibili');
    expect(tokens).toEqual([{ text: 'compresse appetibili', category: 'Forma farmaceutica' }]);
  });

  it('splits English palatable tablets pattern', () => {
    const { tokens } = purifyGalenicSourceToken('250 mg - 10 palatable tablets');
    expect(tokens.some((t) => t.text === 'compresse appetibili' && t.category === 'Forma farmaceutica')).toBe(true);
    expect(tokens.some((t) => t.category === 'Quantità confezione')).toBe(true);
  });
});

describe('refactorTokenCategoryMap', () => {
  it('reduces nome commerciale cardinality for brand variants', () => {
    const result = refactorTokenCategoryMap({
      BAYTRIL: 'Nome commerciale',
      'BAYTRIL 10% O.L.': 'Nome commerciale',
      'BAYTRIL INJECT': 'Nome commerciale',
    });
    const brands = Object.entries(result.tokenCategory).filter(([, c]) => c === 'Nome commerciale');
    expect(brands.length).toBeLessThanOrEqual(2);
  });

  it('cleans EFFIPRO and DINALGEN monoliths from nome commerciale', () => {
    const result = refactorTokenCategoryMap({
      EFFIPRO: 'Nome commerciale',
      'EFFIPRO 50MG SOLUZIONE SPOT ON PER GATTI': 'Nome commerciale',
      'EFFIPRO SOLUZIONE SPOT ON PER CANI DI TAGLIA PICCOLA, MEDIA, GRANDE E GIGANTE': 'Nome commerciale',
      DINALGEN: 'Nome commerciale',
      'DINALGEN 150 MG/ML': 'Nome commerciale',
      'DINALGEN 150 MG/ML SOLUZIONE INIETTABILE BOVINI SUINI CAVALLI': 'Nome commerciale',
      'DINALGEN 300 MG/ML - SOLUZIONE ORALE': 'Nome commerciale',
      'FRONTLINE TRI ACT': 'Nome commerciale',
      'FRONTLINE TRI-ACT': 'Nome commerciale',
      'FRONTLINE TRI ACT SPOT CANI DA 40 KG A 60 KG (A.I.P.)': 'Nome commerciale',
    });
    const brandTexts = Object.entries(result.tokenCategory)
      .filter(([, c]) => c === 'Nome commerciale')
      .map(([t]) => t);
    expect(brandTexts).toContain('EFFIPRO');
    expect(brandTexts).toContain('DINALGEN');
    expect(brandTexts).toContain('FRONTLINE TRI ACT');
    expect(brandTexts.some((t) => t.includes('SOLUZIONE'))).toBe(false);
    expect(brandTexts.some((t) => t.includes('MG/ML'))).toBe(false);
    expect(brandTexts.some((t) => t.length > 40)).toBe(false);
  });

  it('does not keep composite catalog lines as Forma farmaceutica aliases', () => {
    const result = refactorTokenCategoryMap({
      '10 compresse appetibili da 250 mg': 'Forma di confezionamento',
      'compresse appetibili': 'Forma farmaceutica',
      'emulsione oleosa iniettabile': 'Forma farmaceutica',
    });
    const { aliasEntries } = splitCanonicalAndAliases(result.tokenCategory, result.aliases);
    const formaAliases = aliasEntries.filter((a) => a.aliasOf === 'compresse appetibili' || a.aliasOf === 'emulsione');
    expect(formaAliases.some((a) => a.text.includes('250 mg'))).toBe(false);
    expect(formaAliases.some((a) => a.text.includes('10 compresse'))).toBe(false);
    expect(formaAliases.some((a) => a.text.includes('oleosa'))).toBe(false);
  });

  it('does not keep composite catalog lines as Tipo contenitore aliases', () => {
    const result = refactorTokenCategoryMap({
      '1 BLISTER (ACLAR/PVC/ALU) DA 1 COMPRESSA MASTICABILE DA 28,3 MG': 'Forma di confezionamento',
      'bombola da 100 ml': 'Forma di confezionamento',
    });
    const { aliasEntries } = splitCanonicalAndAliases(result.tokenCategory, result.aliases);
    const containerAliases = aliasEntries.filter((a) => a.aliasOf === 'blister' || a.aliasOf === 'bombola');
    expect(containerAliases.length).toBe(0);
  });
});
