/**
 * Builds ElevenLabs Convai exports: dictionary JSON, ontology JSON, unified KB, system prompt.
 */
import type { Analysis, AnalysisRow } from './analysisTypes';
import {
  getCategoryTypeForToken,
  normalizeCategoryOrders,
  normalizeCategoryType,
  type CategoryType,
  type TokenCategory,
} from './dictionaryTree';
import {
  isTerminalItemSlot,
} from './itemPaths';
import type { LoadedDictionaryRef } from './multiDictionarySegment';
import { segmentDescriptionMulti } from './multiDictionarySegment';
import {
  resolveCorpusItemPaths,
  segmentCorpusDescriptions,
} from './corpusItemPaths';
import {
  getPathOrderingCategories,
  itemPathsNeedCanonicalization,
  itemPathsNeedCanonicalizationFromLoadedRefs,
} from './pathCanonicalize';
import {
  formatConvaiDebugTraceLines,
  formatConvaiDebugTracePreamble,
} from './convaiPromptDebugTrace';
import { buildInteractiveMessageFallback } from './messageAssembly';
import {
  getSiblingChoiceChildren,
  requiresVincoloSegmentQuestionNode,
} from './nluCategoryRules';
import { requiresInteractiveNode } from './nluQuestionRules';
import {
  isCanonicalToken,
  segmentDescription,
  type TokenDictionary,
  type TokenEntry,
} from './tokenDictionary';

export interface ConvaiExportMeta {
  documentName: string;
  language: string;
  version: string;
  generatedAt: string;
  warnings: string[];
}

export interface ConvaiDictionaryCategory {
  order: number;
  name: string;
  /** attributo = catalog dimension; vincolo = eligibility constraint (e.g. age). */
  type: CategoryType;
  tokens: string[];
}

export interface ConvaiDictionaryToken {
  canonical: string;
  aliases: string[];
  enabled: boolean;
  /** Inherited from the token's dictionary category. */
  category_type: CategoryType;
}

export interface ConvaiDictionaryExport {
  meta: ConvaiExportMeta;
  categories: ConvaiDictionaryCategory[];
  tokens: ConvaiDictionaryToken[];
}

export interface ConvaiCorpusSegment {
  text: string;
  category_type: CategoryType;
}

export interface ConvaiCorpusItem {
  path: string;
  source_text: string;
  /** Ordered path segments with semantic category type per segment. */
  segments: ConvaiCorpusSegment[];
  unmatched: string[];
}

export type ConvaiInteractiveNodeType = 'sibling_choice';

export interface ConvaiInteractiveNode {
  slot: string;
  type: ConvaiInteractiveNodeType;
  /**
   * Design-time disambiguation draft (NLU/template). The Convai agent paraphrases it
   * naturally at runtime; do not read verbatim.
   */
  prompt_hint: string;
  children?: string[];
}

export interface ConvaiLeafData {
  confirmation_text: string | null;
  source_text: string | null;
}

export interface ConvaiOntologyExport {
  meta: ConvaiExportMeta;
  item_paths: string[];
  corpus_items: ConvaiCorpusItem[];
  interactive_nodes: ConvaiInteractiveNode[];
  leaf_data: Record<string, ConvaiLeafData>;
  start_question: string | null;
  confirmation_preamble: string | null;
}

export interface ConvaiUnifiedKbExport {
  meta: ConvaiExportMeta;
  dictionary: {
    categories: ConvaiDictionaryCategory[];
    tokens: ConvaiDictionaryToken[];
  };
  ontology: {
    item_paths: string[];
    corpus_items: ConvaiCorpusItem[];
    interactive_nodes: ConvaiInteractiveNode[];
    leaf_data: Record<string, ConvaiLeafData>;
    start_question: string | null;
    confirmation_preamble: string | null;
  };
}

export interface ConvaiExportInput {
  documentName: string;
  dictionary: TokenDictionary;
  descriptions: string[];
  analysis: Analysis | null;
  /** When set, corpus paths match the live corpus editor (multi-dictionary). */
  loadedRefs?: LoadedDictionaryRef[];
  dictionaryDirty?: boolean;
  analysisDirty?: boolean;
  pathsOutOfSync?: boolean;
}

function buildMeta(input: ConvaiExportInput, extraWarnings: string[] = []): ConvaiExportMeta {
  const warnings: string[] = [...extraWarnings];
  if (input.dictionaryDirty) {
    warnings.push('Il dizionario contiene modifiche non salvate.');
  }
  if (input.analysisDirty) {
    warnings.push('L\'analisi contiene modifiche non salvate.');
  }
  if (input.pathsOutOfSync) {
    warnings.push('I path del corpus non coincidono con item_paths salvati: esportati path riconciliati.');
  }
  return {
    documentName: input.documentName,
    language: 'it',
    version: '1.1',
    generatedAt: new Date().toISOString(),
    warnings,
  };
}

/** Groups canonical tokens with their alias surfaces and category semantic type. */
export function buildConvaiDictionaryTokens(
  tokens: TokenEntry[],
  categories: import('./dictionaryTree').TokenCategory[] = [],
): ConvaiDictionaryToken[] {
  const canonicals = tokens.filter(isCanonicalToken);
  return canonicals.map((entry) => ({
    canonical: entry.text,
    aliases: tokens
      .filter((t) => t.aliasOf === entry.text)
      .map((t) => t.text),
    enabled: entry.enabled,
    category_type: getCategoryTypeForToken(entry.text, categories),
  }));
}

/** Maps flat segment texts to typed segments using dictionary categories. */
export function buildConvaiCorpusSegments(
  segmentTexts: string[],
  categories: import('./dictionaryTree').TokenCategory[],
): ConvaiCorpusSegment[] {
  return segmentTexts.map((text) => ({
    text,
    category_type: getCategoryTypeForToken(text, categories),
  }));
}

/** Serializes categories and tokens for Convai knowledge base. */
export function buildConvaiDictionaryExport(input: ConvaiExportInput): ConvaiDictionaryExport {
  const categories = normalizeCategoryOrders(input.dictionary.categories ?? []);
  return {
    meta: buildMeta(input),
    categories: categories.map((c) => ({
      order: c.order,
      name: c.name,
      type: normalizeCategoryType(c.type),
      tokens: [...c.tokenTexts],
    })),
    tokens: buildConvaiDictionaryTokens(input.dictionary.tokens, categories),
  };
}

/** Resolves the design-time disambiguation hint exported to Convai (not spoken verbatim). */
export function resolveConvaiPromptHint(
  slot: string,
  row: AnalysisRow | undefined,
  slots: string[],
  itemPaths: string[],
  categories?: TokenCategory[],
): string | null {
  const fallback = buildInteractiveMessageFallback(slots, slot, itemPaths, categories);
  const hint = row?.question?.trim() || fallback.question?.trim();
  return hint || null;
}

function buildInteractiveNodes(
  rows: AnalysisRow[],
  itemPaths: string[],
  categories?: TokenCategory[],
): ConvaiInteractiveNode[] {
  const slots = rows.map((r) => r.slot_filling);
  const rowBySlot = new Map(rows.map((r) => [r.slot_filling, r]));
  const nodes: ConvaiInteractiveNode[] = [];

  for (const slot of slots) {
    if (!requiresInteractiveNode(slots, slot, itemPaths, categories)) continue;

    const row = rowBySlot.get(slot);
    const promptHint = resolveConvaiPromptHint(slot, row, slots, itemPaths, categories);
    if (!promptHint) continue;

    if (requiresVincoloSegmentQuestionNode(slot, itemPaths, categories)) {
      nodes.push({
        slot,
        type: 'sibling_choice',
        prompt_hint: promptHint,
        children: [],
      });
      continue;
    }

    const children = getSiblingChoiceChildren(slots, slot, categories) ?? [];
    nodes.push({
      slot,
      type: 'sibling_choice',
      prompt_hint: promptHint,
      children,
    });
  }

  return nodes;
}

function buildLeafData(
  itemPaths: string[],
  rows: AnalysisRow[],
  corpusByPath: Map<string, string>,
): Record<string, ConvaiLeafData> {
  const rowBySlot = new Map(rows.map((r) => [r.slot_filling, r]));
  const out: Record<string, ConvaiLeafData> = {};

  for (const path of itemPaths) {
    if (!isTerminalItemSlot(path, itemPaths)) continue;
    const row = rowBySlot.get(path);
    out[path] = {
      confirmation_text: row?.confirmation_text?.trim() || null,
      source_text: corpusByPath.get(path) ?? null,
    };
  }

  return out;
}

function corpusSegmentInput(input: ConvaiExportInput) {
  return {
    descriptions: input.descriptions,
    dictionary: input.dictionary,
    loadedRefs: input.loadedRefs,
  };
}

function segmentCorpusRow(
  sourceText: string,
  input: ConvaiExportInput,
): { segments: string[]; unmatched: string[] } {
  if (input.loadedRefs?.length) {
    const result = segmentDescriptionMulti(sourceText, input.loadedRefs);
    return { segments: result.segments.map((s) => s.text), unmatched: result.unmatched };
  }
  const result = segmentDescription(
    sourceText,
    input.dictionary.tokens,
    input.dictionary.categories ?? [],
  );
  return { segments: result.segments, unmatched: result.unmatched };
}

function pathOrderingCategoriesForExport(input: ConvaiExportInput): TokenCategory[] {
  if (input.loadedRefs?.length) {
    return getPathOrderingCategories(input.loadedRefs);
  }
  return normalizeCategoryOrders(input.dictionary.categories ?? []);
}

/** Serializes ontology: item paths, corpus rows (category-ordered), dialog nodes. */
export function buildConvaiOntologyExport(input: ConvaiExportInput): ConvaiOntologyExport {
  const segInput = corpusSegmentInput(input);
  const { rows: segRows } = segmentCorpusDescriptions(segInput);
  const pathCategories = pathOrderingCategoriesForExport(input);
  const itemPaths = resolveCorpusItemPaths(segInput);

  const analysisRows = input.analysis?.rows ?? [];

  const corpusByPath = new Map<string, string>();
  const corpusItems: ConvaiCorpusItem[] = segRows.map((row) => {
    if (!corpusByPath.has(row.path)) {
      corpusByPath.set(row.path, row.sourceText);
    }
    const segmented = segmentCorpusRow(row.sourceText, input);
    return {
      path: row.path,
      source_text: row.sourceText,
      segments: buildConvaiCorpusSegments(segmented.segments, pathCategories),
      unmatched: row.unmatched,
    };
  });

  const exportWarnings: string[] = [];
  const storedPaths = input.analysis?.item_paths ?? [];
  const pathsNeedCanon = input.loadedRefs?.length
    ? itemPathsNeedCanonicalizationFromLoadedRefs(storedPaths, input.loadedRefs)
    : itemPathsNeedCanonicalization(storedPaths, pathCategories);
  if (storedPaths.length > 0 && pathsNeedCanon) {
    exportWarnings.push(
      'item_paths salvati con ordine segmenti non canonico: esportazione usa path dal corpus segmentato.',
    );
  }

  return {
    meta: buildMeta(input, exportWarnings),
    item_paths: itemPaths,
    corpus_items: corpusItems,
    interactive_nodes: buildInteractiveNodes(analysisRows, itemPaths, pathCategories),
    leaf_data: buildLeafData(itemPaths, analysisRows, corpusByPath),
    start_question: input.analysis?.start_question?.trim() || null,
    confirmation_preamble: input.analysis?.confirmation_preamble?.trim() || null,
  };
}

/** Merges dictionary and ontology for a single Convai knowledge-base upload. */
export function buildConvaiUnifiedKbExport(input: ConvaiExportInput): ConvaiUnifiedKbExport {
  const dictionary = buildConvaiDictionaryExport(input);
  const ontology = buildConvaiOntologyExport(input);
  return {
    meta: buildMeta(input, [...new Set([...dictionary.meta.warnings, ...ontology.meta.warnings])]),
    dictionary: {
      categories: dictionary.categories,
      tokens: dictionary.tokens,
    },
    ontology: {
      item_paths: ontology.item_paths,
      corpus_items: ontology.corpus_items,
      interactive_nodes: ontology.interactive_nodes,
      leaf_data: ontology.leaf_data,
      start_question: ontology.start_question,
      confirmation_preamble: ontology.confirmation_preamble,
    },
  };
}

export interface ConvaiSystemPromptInput {
  documentName: string;
  startQuestion: string | null;
  confirmationPreamble: string | null;
  /** Exported categories (with type) for domain-specific constraint hints. */
  categories?: ConvaiDictionaryCategory[];
}

function formatConstraintCategoryHints(categories: ConvaiDictionaryCategory[]): string[] {
  const vincoli = categories
    .filter((c) => c.type === 'vincolo')
    .sort((a, b) => a.order - b.order);
  if (vincoli.length === 0) return [];
  return [
    '',
    'VINCOLI NEL DOMINIO (categorie type=vincolo)',
    ...vincoli.map(
      (c) => `- "${c.name}" (ordine ${c.order}): token ${c.tokens.join(', ') || '(nessuno)'}`,
    ),
  ];
}

/** Compiles the Convai agent system prompt (motor rules + dialog protocol). */
export function compileConvaiSystemPrompt(input: ConvaiSystemPromptInput): string {
  const lines: string[] = [
    'Sei un assistente vocale per la prenotazione di prestazioni mediche.',
    `Dominio: ${input.documentName}. Lingua: italiano.`,
    '',
    ...formatConvaiDebugTracePreamble(),
    'CONOSCENZA',
    '- Usa SOLO i dati nella knowledge base: dizionario (categories, tokens), ontologia (item_paths, corpus_items, interactive_nodes, leaf_data).',
    '- Non inventare prestazioni, segmenti o categorie fuori catalogo.',
    '- Ogni token ha category_type; ogni segmento in corpus_items ha { text, category_type }.',
    '',
    'TIPI DI CATEGORIA',
    '- attributo: dimensione del catalogo (tipo esame, distretto, lato…). L\'utente può disambiguare tra fratelli allo stesso livello.',
    '- vincolo: regola di ammissibilità (es. fascia d\'età). NON è una scelta tra alternative equivalenti: filtra quali item_paths restano validi.',
    '',
    'MOTORE DI SELEZIONE (equivalente al terminologo)',
    '1. Dalla frase utente riconosci quali token del dizionario sono presenti (canonical + alias), con flessibilità morfologica italiana.',
    '2. NON costruire path nuovi: scegli solo tra item_paths definiti nell\'ontologia.',
    '3. Per ogni item_path conta quanti segmenti/nodi del path sono evidenziati nel testo (usa corpus_items.segments come riferimento ordinato).',
    '4. Vince l\'item con il conteggio più alto.',
    '5. In caso di parità, preferisci il path con meno segmenti (più specifico nel corpus).',
    '6. Accumula le frasi dell\'utente nel corso della conversazione prima di ricalcolare il match.',
    '',
    'VINCOLI (segmenti con category_type = vincolo)',
    '7. I segmenti vincolo nei path indicano regole di eligibilità, non opzioni da presentare come menu.',
    '8. Se manca un dato necessario per un vincolo (es. età in anni), chiedilo esplicitamente prima di confermare un item terminale.',
    '9. Valida la risposta rispetto ai token della categoria vincolo nel dizionario (es. "ho 15 anni" → fascia compatibile).',
    '10. Dopo la validazione, escludi dagli item_paths candidati quelli il cui segmento vincolo non è compatibile.',
    '11. NON chiedere "quale fascia?" tra token vincolo se l\'utente non ha ancora dato l\'età: chiedi prima l\'età, poi filtra.',
    '',
    'ATTRIBUTI E RICHIESTE GENERICHE',
    '12. Per segmenti attributo, usa sibling_choice come da interactive_nodes.',
    '13. Se la richiesta è generica e molti item_paths corrispondono (es. solo il tipo di esame), NON elencare tutto il catalogo.',
    '14. Usa dictionary.categories (type=attributo) per guidare: indica le dimensioni ancora mancanti e 2–3 esempi concreti da corpus_items o leaf_data.source_text.',
    '15. Chiedi una dimensione attributo alla volta, rispettando category.order.',
    '',
    'FORMULAZIONE VOCALE (prompt_hint)',
    '- interactive_nodes[].prompt_hint è una bozza secca creata a design time: NON leggerla parola per parola.',
    '- Riformulala in italiano parlato, naturale e asciutto (massimo 2 frasi).',
    '- Mantieni invariato: dimensione da chiedere, opzioni ammesse (children), significato clinico.',
    '- Le opzioni ammesse sono SOLO quelle strutturali nel nodo; non aggiungerne altre.',
    '- start_question e leaf_data.confirmation_text sono anch\'essi bozze parafrasabili, non script rigidi.',
    '',
    'NAVIGAZIONE DIALOGO',
    '16. Nodo con un solo figlio → trasparente, prosegui senza domanda.',
    '17. sibling_choice (2+ figli) → disambigua usando prompt_hint del nodo corrispondente.',
    '18. Item terminale → conferma usando leaf_data.confirmation_text come bozza (prefisso opzionale da confirmation_preamble).',
    '19. Se non capisci la risposta: ripeti con formulazione diversa e più semplice; non elencare tutto il catalogo.',
    '20. Tieni traccia del nodo interattivo corrente (currentPath) e se stai attendendo una disambiguazione.',
    ...formatConvaiDebugTraceLines(),
    ...formatConstraintCategoryHints(input.categories ?? []),
  ];

  if (input.startQuestion?.trim()) {
    lines.push('', 'APERTURA', `- Bozza start_question (parafrasabile, asciutta): ${input.startQuestion.trim()}`);
  }

  if (input.confirmationPreamble?.trim()) {
    lines.push('', 'CONFERMA', `- Bozza confirmation_preamble (parafrasabile): ${input.confirmationPreamble.trim()}`);
  }

  return lines.join('\n');
}

export interface ConvaiFullExport {
  systemPrompt: string;
  dictionaryJson: string;
  ontologyJson: string;
  unifiedKbJson: string;
  warnings: string[];
}

/** Builds all Convai export artifacts from current editor state. */
export function buildConvaiFullExport(input: ConvaiExportInput): ConvaiFullExport {
  const dictionary = buildConvaiDictionaryExport(input);
  const ontology = buildConvaiOntologyExport(input);
  const unified = buildConvaiUnifiedKbExport(input);
  const systemPrompt = compileConvaiSystemPrompt({
    documentName: input.documentName,
    startQuestion: ontology.start_question,
    confirmationPreamble: ontology.confirmation_preamble,
    categories: dictionary.categories,
  });

  const warnings = [...new Set([
    ...dictionary.meta.warnings,
    ...ontology.meta.warnings,
  ])];

  return {
    systemPrompt,
    dictionaryJson: JSON.stringify(dictionary, null, 2),
    ontologyJson: JSON.stringify(ontology, null, 2),
    unifiedKbJson: JSON.stringify(unified, null, 2),
    warnings,
  };
}
