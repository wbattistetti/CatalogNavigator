/**
 * Builds human-readable structured Convai KB (ITEM blocks) and matching system prompt.
 */
import type { ConvaiExportInput, ConvaiExportMeta } from './convaiExport';
import {
  getCategoryIdForToken,
  getCategorySortOrder,
  normalizeCategoryOrders,
  normalizeCategoryType,
  resolveCategoryTypeForExport,
  type CategoryType,
  type TokenCategory,
} from './dictionaryTree';
import { formatAgeConstraintKbValue, parseAgeConstraintToken } from './ageConstraintParse';
import { AGE_YEARS_QUESTION } from './constraintValidation';
import {
  getActiveMatchPhrases,
  normalizeDescriptionText,
  segmentAllDescriptions,
  segmentWordsWithPositions,
  tokenizeToWords,
  type TokenEntry,
} from './tokenDictionary';
import {
  CONVAI_PARSED_DEBUG_SEPARATOR,
  formatConvaiDebugTraceLines,
  formatConvaiDebugTracePreamble,
} from './convaiPromptDebugTrace';

/** Label for tokens not assigned to any dictionary category. */
export const STRUCTURED_KB_NO_CATEGORY_LABEL = 'No category';

/** Suffix appended to category name on vincolo rows in structured KB. */
export const STRUCTURED_KB_VINCOLO_SUFFIX = ' (vincolo)';

export interface StructuredItemLine {
  label: string;
  value: string;
  categoryType?: CategoryType;
}

/** Formats the category label for one structured KB row (vincolo rows are tagged). */
export function formatStructuredKbLineLabel(category: Pick<TokenCategory, 'name' | 'type'>): string {
  if (resolveCategoryTypeForExport(category) === 'vincolo') {
    return `${category.name}${STRUCTURED_KB_VINCOLO_SUFFIX}`;
  }
  return category.name;
}

export interface StructuredConvaiKbExport {
  meta: ConvaiExportMeta;
  /** Plain-text knowledge base for Convai document upload. */
  kbText: string;
  itemCount: number;
}

export interface StructuredConvaiSystemPromptInput {
  documentName: string;
  startQuestion: string | null;
  confirmationPreamble: string | null;
  categories: TokenCategory[];
}

function buildStructuredMeta(input: ConvaiExportInput): ConvaiExportMeta {
  const warnings: string[] = [];
  if (input.dictionaryDirty) {
    warnings.push('Il dizionario contiene modifiche non salvate.');
  }
  if (input.analysisDirty) {
    warnings.push('L\'analisi contiene modifiche non salvate.');
  }
  return {
    documentName: input.documentName,
    language: 'it',
    version: '1.0',
    generatedAt: new Date().toISOString(),
    warnings,
  };
}

function sortMatchesByCategoryOrder(
  matches: Array<{ text: string; wordStartIndex: number }>,
  categories: TokenCategory[],
): Array<{ text: string; wordStartIndex: number }> {
  return [...matches].sort((a, b) => {
    const orderA = getCategorySortOrder(a.text, categories);
    const orderB = getCategorySortOrder(b.text, categories);
    if (orderA !== orderB) return orderA - orderB;
    return a.wordStartIndex - b.wordStartIndex;
  });
}

/** Maps one corpus row to ordered category lines for structured KB export. */
export function buildStructuredItemLines(
  sourceText: string,
  tokens: TokenEntry[],
  categories: TokenCategory[],
): StructuredItemLine[] {
  const normalized = normalizeDescriptionText(sourceText);
  if (!normalized) return [];

  const matchPhrases = getActiveMatchPhrases(tokens);
  if (matchPhrases.length === 0) return [];

  const words = tokenizeToWords(normalized);
  const { matches } = segmentWordsWithPositions(words, matchPhrases);
  const ordered = sortMatchesByCategoryOrder(matches, categories);

  return ordered.map((match) => {
    const categoryId = getCategoryIdForToken(match.text, categories);
    const category = categoryId
      ? categories.find((c) => c.id === categoryId)
      : undefined;
    if (!category) {
      return { label: STRUCTURED_KB_NO_CATEGORY_LABEL, value: match.text };
    }
    return {
      label: formatStructuredKbLineLabel(category),
      value: match.text,
      categoryType: resolveCategoryTypeForExport(category),
    };
  });
}

function formatStructuredKbLineValue(line: StructuredItemLine): string {
  if (line.categoryType === 'vincolo') {
    return formatAgeConstraintKbValue(line.value);
  }
  return line.value;
}

function formatStructuredItemBlock(
  sourceText: string,
  lines: StructuredItemLine[],
): string {
  const body = lines.map((line) => `${line.label}: ${formatStructuredKbLineValue(line)}`).join('\n');
  return `ITEM: ${sourceText}\n${body}`;
}

function formatCategoryOrderSection(categories: TokenCategory[]): string {
  const ordered = normalizeCategoryOrders(categories).filter((c) => c.tokenTexts.length > 0);
  if (ordered.length === 0) return '';

  const rows = ordered.map(
    (c) => `- ${c.name} (${resolveCategoryTypeForExport(c)})`,
  );
  return ['CATEGORIE (ordine disambiguazione):', ...rows, ''].join('\n');
}

/** Compiles plain-text structured KB: category index + ITEM blocks separated by blank lines. */
export function buildStructuredConvaiKbExport(input: ConvaiExportInput): StructuredConvaiKbExport {
  const categories = normalizeCategoryOrders(input.dictionary.categories ?? []);
  const { rows } = segmentAllDescriptions(
    input.descriptions,
    input.dictionary.tokens,
    categories,
  );

  const blocks: string[] = [];
  for (const row of rows) {
    const lines = buildStructuredItemLines(row.sourceText, input.dictionary.tokens, categories);
    if (lines.length === 0) continue;
    blocks.push(formatStructuredItemBlock(row.sourceText, lines));
  }

  const header = formatCategoryOrderSection(categories);
  const kbText = header
    ? `${header}${blocks.join('\n\n')}`
    : blocks.join('\n\n');

  return {
    meta: buildStructuredMeta(input),
    kbText,
    itemCount: blocks.length,
  };
}

/** Lists vincolo tokens per category so the LLM asks age (never offers fasce as a menu). */
export function formatStructuredVincoloTokenCatalog(categories: TokenCategory[]): string[] {
  const vincoli = normalizeCategoryOrders(categories)
    .filter((c) => resolveCategoryTypeForExport(c) === 'vincolo' && c.tokenTexts.length > 0);
  if (vincoli.length === 0) return [];

  const lines: string[] = [
    '',
    'TOKEN VINCOLO (NON SONO OPZIONI DA PROPORRE ALL\'UTENTE)',
    '- Compaiono nella KB solo per filtrare ammissibilità dopo aver raccolto il dato.',
    '- VIETATO chiederli come menu ("vuole dai 3 anni o maggiori di 3 anni?").',
    `- Per fasce età numeriche: chiedi SEMPRE "${AGE_YEARS_QUESTION}" e usa età_min/età_max sulla riga KB.`,
    '',
  ];

  for (const category of vincoli) {
    const tokens = [...category.tokenTexts].sort((a, b) => a.localeCompare(b, 'it'));
    lines.push(`Categoria "${category.name}" (vincolo) — token catalogo:`);
    for (const token of tokens) {
      const range = parseAgeConstraintToken(token);
      const hint = range
        ? ` → filtro età inclusivo: min=${range.min ?? 'null'}, max=${range.max ?? 'null'}, min_sett=${range.minWeeks ?? 'null'}, max_sett=${range.maxWeeks ?? 'null'}`
        : ' → inferisci dal testo quale dato grezzo chiedere (es. età in anni)';
      lines.push(`  - "${token}"${hint}`);
    }
    lines.push('');
  }

  lines.push(
    'ESEMPI DIALOGO VINCOLO ETÀ (call center)',
    `  ✅ Utente: "controllo allergologico" → tu: "${AGE_YEARS_QUESTION}"`,
    '  ❌ SBAGLIATO: "Preferisce maggiori di 3 anni o dai 3 anni?"',
    '  ✅ Utente: "5 anni" → filtra con età_min/età_max, poi disambigua solo attributi rimasti.',
    '  ❌ SBAGLIATO: elencare in voce "neonatale, da 5 settimane, dai 3 anni…" come opzioni.',
  );

  return lines;
}

/** System prompt for structured KB: match, disambiguation by category order, subset upgrade. */
export function compileStructuredConvaiSystemPrompt(
  input: StructuredConvaiSystemPromptInput,
): string {
  const categoryLines = normalizeCategoryOrders(input.categories)
    .filter((c) => c.tokenTexts.length > 0)
    .map((c) => `- ${c.name} (${resolveCategoryTypeForExport(c)})`);

  const lines: string[] = [
    'Sei un assistente vocale per la prenotazione di prestazioni mediche.',
    `Dominio: ${input.documentName}. Lingua: italiano.`,
    '',
    ...formatConvaiDebugTracePreamble(),
    'KNOWLEDGE BASE STRUTTURATA',
    '- La KB è un documento testuale con blocchi ITEM separati da righe vuote.',
    '- Ogni blocco inizia con "ITEM: …" seguito da righe "NomeCategoria: valore_token" (le categorie vincolo hanno "(vincolo)" nel nome riga; le fasce età possono includere età_min / età_max).',
    '- La riga "ITEM:" contiene la descrizione grezza del catalogo: IGNORALA per match, disambiguazione e scelta finale. Serve solo come riferimento umano.',
    '- Usa SOLO le righe sotto "ITEM:" (incluso "No category:" per token fuori categoria).',
    '- Non inventare categorie, token o prestazioni fuori dalla KB.',
    '- L\'ordine di disambiguazione segue la sezione CATEGORIE in KB (e le categorie del dizionario).',
    '',
    'CATEGORIE DEL DIZIONARIO (ordine disambiguazione)',
    ...(categoryLines.length > 0 ? categoryLines : ['- (nessuna categoria con token)']),
    '',
    'TIPI DI CATEGORIA',
    '- attributo: dimensione del catalogo; disambigua tra valori diversi sulla stessa categoria.',
    '- vincolo: regola di ammissibilità; prima chiedi il dato, poi filtra — non come menu tra fasce.',
    '',
    'CRITERI GIÀ NOTI',
    '- Attributi già detti dall\'utente (es. "prima visita", "endocrinologica") contano come criteri matched.',
    '- Un vincolo diventa criterio attivo solo DOPO che hai chiesto il dato e l\'utente ha risposto (es. età: 16).',
    '- Dopo un vincolo risolto, quel vincolo NON è mai una "scelta tra opzioni": è solo un filtro di ammissibilità.',
    '',
    'STATO INTERNO (obbligatorio, aggiorna a ogni turno prima di rispondere)',
    'Tieni traccia mentalmente di:',
    '- candidati_attivi: elenco ITEM ancora ammissibili (inizia da tutta la KB, poi restringi).',
    '- attributi_risolti: coppie categoria→valore già fissate dal dialogo.',
    '- vincoli_risolti: coppie categoria vincolo→valore fornito dall\'utente (es. età=16).',
    '- prossima_azione: "chiedi_vincolo" | "chiedi_attributo" | "conferma" | "upgrade_subset".',
    'NON rispondere all\'utente finché non hai aggiornato candidati_attivi e scelto prossima_azione.',
    '',
    'PROCEDURA PER OGNI TURNO (segui in ordine — FILTRA prima, PARLA dopo)',
    'T1. Aggiorna attributi_risolti e vincoli_risolti con l\'ultima risposta utente.',
    'T2. FILTRO VINCOLI: per ogni ITEM in candidati_attivi, verifica TUTTI i vincoli_risolti.',
    '    - Interpreta il testo naturale del vincolo (es. "da 6 anni a 15 anni" → ammessi 6..15 inclusi).',
    '    - Se presenti età_min/età_max sulla riga KB, usali come controllo aggiuntivo.',
    '    - Rimuovi dall\'elenco gli ITEM incompatibili. NON nominarli all\'utente.',
    'T3. MATCH ATTRIBUTI: tra i candidati rimasti, conta overlap token attributo nel dettato cumulativo.',
    '    - Tieni solo ITEM con conteggio massimo (ex aequo).',
    'T4. Se candidati_attivi è VUOTO → ricontrolla la KB; non inventare assenze.',
    'T5. Se candidati_attivi ha 1 solo ITEM → prossima_azione=conferma (parafrasa le righe strutturate).',
    'T6. Se candidati_attivi ha 2+ ITEM → trova la prima categoria (ordine dizionario) NON ancora coperta da attributi_risolti o vincoli_risolti in cui i candidati differiscono.',
    'T7. Se quella categoria è VINCOLO → prossima_azione=chiedi_vincolo.',
    '    - Chiedi UN solo dato grezzo (es. età: "Quanti anni ha il paziente?").',
    '    - VIETATO elencare fasce, range, neonatale, opzioni o token vincolo dalla KB come menu.',
    '    - STOP: non applicare T8.',
    'T8. Se quella categoria è ATTRIBUTO → prossima_azione=chiedi_attributo (max 2 opzioni nominate se sono 2; altrimenti 2 esempi + invito a specificare).',
    'T9. Parla all\'utente SOLO in base a prossima_azione. Vietato saltare T2–T8 e proporre direttamente "quale prestazione".',
    'T10. OBBLIGATORIO: appendi ---PARSED--- e il blocco TRACCIA DEBUG (mai omettere, anche al primo turno).',
    '',
    'REGOLE INVIOLABILI',
    `- OGNI risposta termina con ${CONVAI_PARSED_DEBUG_SEPARATOR} e blocco PARSED (T10).`,
    '- MAI chiedere "per quale fascia di età" né elencare fasce dalla KB: chiedi solo l\'età in anni.',
    '- MAI chiedere di scegliere tra ITEM che differiscono SOLO su una riga (vincolo) già risolta o risolvibile con un dato (es. età).',
    '- MAI offrire "pediatrica 6-15 oppure 16+" dopo che l\'utente ha già detto l\'età: filtra prima.',
    '- MAI dire che non esiste una prestazione se candidati_attivi non è vuoto.',
    '- MAI elencare tutti gli ITEM candidati.',
    '- La riga "ITEM:" in testa al blocco è IGNORATA per match e decisioni.',
    '',
    'ITEM QUASI UGUALI (sottoinsieme di token)',
    '- Se ITEM A ⊆ ITEM B (B ha token in più) e l\'utente ha detto solo la parte comune → prossima_azione=upgrade_subset.',
    '- Chiedi in modo naturale se vuole anche il pezzo aggiuntivo; sì→B, no→A.',
    '',
    'ESEMPI ENDOCRINOLOGIA (applica la procedura T1–T9)',
    '- Utente: prima visita endocrinologica, età 15 → FILTRO: tieni ITEM 6-15, escludi 16+; se resta 1 ITEM → conferma; se restano 2+ (es. + ipotiroidismo) → chiedi attributo diverso (patologia), NON le fasce.',
    '- Utente: prima visita endocrinologica, età 16 → FILTRO: escludi pediatrica 6-15 (16>15); tieni 16+; NON chiedere "pediatrica o 16+?".',
    '- SBAGLIATO: "Abbiamo pediatrica 6-15 oppure visita 16+, quale desidera?" dopo aver già ricevuto l\'età.',
    '- SBAGLIATO: "A 15 anni solo dai 16 in su" quando esiste ITEM pediatrico in KB.',
    '- SBAGLIATO: "A 16 anni pediatrica 6-15 oppure 16+" — la pediatrica va eliminata in T2.',
    '- SBAGLIATO: "Per quale fascia di età? Ho opzioni neonatale, da 5 settimane a 1 anno…" — chiedi solo "Quanti anni ha il paziente?".',
    '',
    'STILE VOCALE',
    '- Italiano parlato, fluido e asciutto (massimo 2 frasi) — SOLO la parte prima di ---PARSED---.',
    '- Niente elenchi lunghi a voce, niente bullet, niente tecnicismi.',
    '- Le righe KB non sono script: riformula sempre in modo naturale.',
    ...formatConvaiDebugTraceLines(),
    ...formatStructuredVincoloTokenCatalog(input.categories),
  ];

  if (input.startQuestion?.trim()) {
    lines.push('', 'APERTURA', `- Bozza (parafrasabile): ${input.startQuestion.trim()}`);
  }

  if (input.confirmationPreamble?.trim()) {
    lines.push('', 'CONFERMA FINALE', `- Prefisso opzionale (parafrasabile): ${input.confirmationPreamble.trim()}`);
  }

  return lines.join('\n');
}

export interface StructuredConvaiFullExport {
  structuredKbText: string;
  structuredSystemPrompt: string;
  itemCount: number;
  warnings: string[];
}

/** Builds structured KB text and dedicated system prompt. */
export function buildStructuredConvaiFullExport(input: ConvaiExportInput): StructuredConvaiFullExport {
  const kb = buildStructuredConvaiKbExport(input);
  const categories = normalizeCategoryOrders(input.dictionary.categories ?? []);
  const structuredSystemPrompt = compileStructuredConvaiSystemPrompt({
    documentName: input.documentName,
    startQuestion: input.analysis?.start_question?.trim() || null,
    confirmationPreamble: input.analysis?.confirmation_preamble?.trim() || null,
    categories,
  });

  return {
    structuredKbText: kb.kbText,
    structuredSystemPrompt,
    itemCount: kb.itemCount,
    warnings: kb.meta.warnings,
  };
}
