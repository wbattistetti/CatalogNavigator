/**
 * Tests for structured Convai KB export.
 */
import { describe, expect, it } from 'vitest';
import {
  STRUCTURED_KB_NO_CATEGORY_LABEL,
  STRUCTURED_KB_VINCOLO_SUFFIX,
  buildStructuredConvaiKbExport,
  buildStructuredConvaiFullExport,
  buildStructuredItemLines,
  compileStructuredConvaiSystemPrompt,
  formatStructuredKbLineLabel,
  formatStructuredVincoloTokenCatalog,
} from './convaiStructuredExport';
import type { TokenDictionary } from './tokenDictionary';

const dictionary: TokenDictionary = {
  descriptionColumn: 'descrizione',
  categories: [
    { id: 'c1', name: 'Tipo esame', order: 0, tokenTexts: ['tac'] },
    { id: 'c2', name: 'Distretto', order: 1, tokenTexts: ['ginocchio'] },
    { id: 'c3', name: 'Lato', order: 2, tokenTexts: ['destro', 'sinistro'] },
  ],
  tokens: [
    { text: 'tac', enabled: true },
    { text: 'ginocchio', enabled: true },
    { text: 'destro', enabled: true },
    { text: 'sinistro', enabled: true },
    { text: 'senza contrasto', enabled: true },
  ],
};

const descriptions = [
  'TAC ginocchio destro senza contrasto',
  'TAC ginocchio sinistro',
];

const baseInput = {
  documentName: 'Esami',
  dictionary,
  descriptions,
  analysis: {
    id: 'a1',
    document_id: 'd1',
    rows: [],
    item_paths: [],
    start_question: 'Come posso aiutarla?',
    confirmation_preamble: 'Confermo:',
    created_at: '',
    updated_at: '',
  },
};

describe('formatStructuredKbLineLabel', () => {
  it('appends (vincolo) suffix for constraint categories', () => {
    expect(formatStructuredKbLineLabel({ name: 'fascia di età', type: 'vincolo' }))
      .toBe(`fascia di età${STRUCTURED_KB_VINCOLO_SUFFIX}`);
    expect(formatStructuredKbLineLabel({ name: 'esame', type: 'attributo' }))
      .toBe('esame');
  });

  it('infers vincolo from category name when type is not saved', () => {
    expect(formatStructuredKbLineLabel({ name: 'fascia di età', type: 'attributo' }))
      .toBe(`fascia di età${STRUCTURED_KB_VINCOLO_SUFFIX}`);
  });
});

describe('buildStructuredItemLines', () => {
  it('tags vincolo rows in structured KB lines', () => {
    const dict: TokenDictionary = {
      descriptionColumn: 'descrizione',
      categories: [
        { id: 'c1', name: 'esame', order: 0, tokenTexts: ['ecodoppler'], type: 'attributo' },
        { id: 'c2', name: 'fascia di età', order: 1, tokenTexts: ['> 17 anni'], type: 'vincolo' },
      ],
      tokens: [
        { text: 'ecodoppler', enabled: true },
        { text: '> 17 anni', enabled: true },
      ],
    };
    const lines = buildStructuredItemLines(
      'ecodoppler > 17 anni',
      dict.tokens,
      dict.categories ?? [],
    );
    expect(lines).toEqual([
      { label: 'esame', value: 'ecodoppler', categoryType: 'attributo' },
      { label: `fascia di età${STRUCTURED_KB_VINCOLO_SUFFIX}`, value: '> 17 anni', categoryType: 'vincolo' },
    ]);
  });

  it('orders lines by category and labels uncategorized tokens', () => {
    const lines = buildStructuredItemLines(
      'TAC ginocchio destro senza contrasto',
      dictionary.tokens,
      dictionary.categories ?? [],
    );
    expect(lines).toEqual([
      { label: 'Tipo esame', value: 'tac', categoryType: 'attributo' },
      { label: 'Distretto', value: 'ginocchio', categoryType: 'attributo' },
      { label: 'Lato', value: 'destro', categoryType: 'attributo' },
      { label: STRUCTURED_KB_NO_CATEGORY_LABEL, value: 'senza contrasto' },
    ]);
  });
});

describe('buildStructuredConvaiKbExport', () => {
  it('exports ITEM header with raw text and structured lines below', () => {
    const out = buildStructuredConvaiKbExport(baseInput);
    expect(out.itemCount).toBe(2);
    expect(out.kbText).toContain('ITEM: TAC ginocchio destro senza contrasto');
    expect(out.kbText).toContain('Tipo esame: tac');
    expect(out.kbText).toContain('Lato: destro');
    expect(out.kbText).toContain(`${STRUCTURED_KB_NO_CATEGORY_LABEL}: senza contrasto`);
    expect(out.kbText).toContain('CATEGORIE (ordine disambiguazione):');
    expect(out.kbText).not.toContain('interactive_nodes');
  });

  it('tags fascia di età rows with (vincolo) in KB text', () => {
    const dict: TokenDictionary = {
      descriptionColumn: 'descrizione',
      categories: [
        { id: 'c1', name: 'esame', order: 0, tokenTexts: ['ecodoppler'] },
        { id: 'c2', name: 'fascia di età', order: 1, tokenTexts: ['> 17 anni'] },
      ],
      tokens: [
        { text: 'ecodoppler', enabled: true },
        { text: '> 17 anni', enabled: true },
      ],
    };
    const out = buildStructuredConvaiKbExport({
      ...baseInput,
      dictionary: dict,
      descriptions: ['ecodoppler > 17 anni'],
    });
    expect(out.kbText).toContain(`fascia di età${STRUCTURED_KB_VINCOLO_SUFFIX}: > 17 anni | età_min: 18 | età_max: null`);
    expect(out.kbText).toContain('- fascia di età (vincolo)');
  });
});

describe('formatStructuredVincoloTokenCatalog', () => {
  it('lists vincolo tokens with age filter hints and dialogue examples', () => {
    const lines = formatStructuredVincoloTokenCatalog([
      { id: 'c1', name: 'fascia di età', order: 0, tokenTexts: ['>3 anni', 'dai 3 anni'], type: 'vincolo' },
    ]);
    const text = lines.join('\n');
    expect(text).toContain('TOKEN VINCOLO');
    expect(text).toContain('>3 anni');
    expect(text).toContain('dai 3 anni');
    expect(text).toContain('Quanti anni ha il paziente?');
    expect(text).toContain('NON SONO OPZIONI');
    expect(text).toContain('filtro età inclusivo');
  });
});

describe('compileStructuredConvaiSystemPrompt', () => {
  it('instructs agent to ignore ITEM line and use category rows', () => {
    const text = compileStructuredConvaiSystemPrompt({
      documentName: 'Esami',
      startQuestion: 'Come posso aiutarla?',
      confirmationPreamble: null,
      categories: dictionary.categories ?? [],
    });
    expect(text).toContain('IGNORALA');
    expect(text).toContain('ex aequo');
    expect(text).toContain('sottoinsieme di token');
    expect(text).toContain('STATO INTERNO');
    expect(text).toContain('PROCEDURA PER OGNI TURNO');
    expect(text).toContain('T10.');
    expect(text).toContain('REGOLA ASSOLUTA OUTPUT');
    expect(text).toContain('FILTRA prima, PARLA dopo');
    expect(text).toContain('candidati_attivi');
    expect(text).toContain('REGOLE INVIOLABILI');
    expect(text).toContain('pediatrica 6-15 oppure 16+');
    expect(text).toContain('Per quale fascia di età');
    expect(text).toContain('ESEMPI ENDOCRINOLOGIA');
    expect(text).toContain('Quanti anni ha il paziente?');
    expect(text).toContain('TRACCIA DEBUG');
    expect(text).toContain('---PARSED---');
    expect(text).toContain('PROSSIMA_AZIONE:');
    expect(text).toContain('Vietato nel PARSED: turno_corrente, cumulativo, candidati_attivi');
    expect(text).not.toMatch(/PARSED[\s\S]*turno_corrente:/);
    expect(text).not.toContain('no_match_1');
    expect(text).not.toContain('interactive_nodes');
  });

  it('includes vincolo token catalog when dictionary has constraint categories', () => {
    const text = compileStructuredConvaiSystemPrompt({
      documentName: 'Allergie',
      startQuestion: null,
      confirmationPreamble: null,
      categories: [
        { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['allergologica'], type: 'attributo' },
        { id: 'c2', name: 'fascia di età', order: 1, tokenTexts: ['>3 anni', 'dai 3 anni'], type: 'vincolo' },
      ],
    });
    expect(text).toContain('TOKEN VINCOLO');
    expect(text).toContain('>3 anni');
    expect(text).toContain('dai 3 anni');
  });
});

describe('buildStructuredConvaiFullExport', () => {
  it('returns kb text and structured prompt', () => {
    const out = buildStructuredConvaiFullExport(baseInput);
    expect(out.structuredKbText.length).toBeGreaterThan(50);
    expect(out.structuredSystemPrompt.length).toBeGreaterThan(100);
    expect(out.itemCount).toBe(2);
  });
});
