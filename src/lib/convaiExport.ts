/**
 * Builds ElevenLabs Convai exports: dictionary JSON, ontology JSON, unified KB, system prompt.
 */
import type { Analysis, AnalysisRow } from './analysisTypes';
import { getDirectChildSlots } from './analysisTree';
import { normalizeCategoryOrders } from './dictionaryTree';
import {
  getDescendantItemSlots,
  getDirectChildItemSlots,
  isPrefixAmbiguityNode,
  isTerminalItemSlot,
  normalizeItemPaths,
  reconcileItemPaths,
} from './itemPaths';
import {
  buildInteractiveMessageFallback,
  defaultNoMatchReplies,
} from './messageAssembly';
import { requiresInteractiveNode } from './nluQuestionRules';
import {
  isCanonicalToken,
  segmentAllDescriptions,
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
  tokens: string[];
}

export interface ConvaiDictionaryToken {
  canonical: string;
  aliases: string[];
  enabled: boolean;
}

export interface ConvaiDictionaryExport {
  meta: ConvaiExportMeta;
  categories: ConvaiDictionaryCategory[];
  tokens: ConvaiDictionaryToken[];
}

export interface ConvaiCorpusItem {
  path: string;
  source_text: string;
  segments: string[];
  unmatched: string[];
}

export type ConvaiInteractiveNodeType = 'sibling_choice' | 'prefix_ambiguity';

export interface ConvaiInteractiveNode {
  slot: string;
  type: ConvaiInteractiveNodeType;
  question: string;
  no_match_1: string;
  no_match_2: string;
  no_match_3: string;
  children?: string[];
  parent_item?: string;
  child_items?: string[];
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
    version: '1.0',
    generatedAt: new Date().toISOString(),
    warnings,
  };
}

/** Groups canonical tokens with their alias surfaces. */
export function buildConvaiDictionaryTokens(tokens: TokenEntry[]): ConvaiDictionaryToken[] {
  const canonicals = tokens.filter(isCanonicalToken);
  return canonicals.map((entry) => ({
    canonical: entry.text,
    aliases: tokens
      .filter((t) => t.aliasOf === entry.text)
      .map((t) => t.text),
    enabled: entry.enabled,
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
      tokens: [...c.tokenTexts],
    })),
    tokens: buildConvaiDictionaryTokens(input.dictionary.tokens),
  };
}

function resolveInteractiveMessages(
  slot: string,
  row: AnalysisRow | undefined,
  slots: string[],
  itemPaths: string[],
): Pick<AnalysisRow, 'question' | 'no_match_1' | 'no_match_2' | 'no_match_3'> {
  const fallback = buildInteractiveMessageFallback(slots, slot, itemPaths);
  const question = row?.question?.trim() || fallback.question;
  const noMatch = defaultNoMatchReplies(question);
  return {
    question,
    no_match_1: row?.no_match_1?.trim() || fallback.no_match_1 || noMatch.no_match_1,
    no_match_2: row?.no_match_2?.trim() || fallback.no_match_2 || noMatch.no_match_2,
    no_match_3: row?.no_match_3?.trim() || fallback.no_match_3 || noMatch.no_match_3,
  };
}

function buildInteractiveNodes(
  rows: AnalysisRow[],
  itemPaths: string[],
): ConvaiInteractiveNode[] {
  const slots = rows.map((r) => r.slot_filling);
  const rowBySlot = new Map(rows.map((r) => [r.slot_filling, r]));
  const nodes: ConvaiInteractiveNode[] = [];

  for (const slot of slots) {
    if (!requiresInteractiveNode(slots, slot, itemPaths)) continue;

    const row = rowBySlot.get(slot);
    const messages = resolveInteractiveMessages(slot, row, slots, itemPaths);
    if (!messages.question?.trim()) continue;

    if (isPrefixAmbiguityNode(slots, slot, itemPaths)) {
      const directChildItems = getDirectChildItemSlots(slot, itemPaths);
      const childItems = directChildItems.length > 0
        ? directChildItems
        : getDescendantItemSlots(slot, itemPaths);
      nodes.push({
        slot,
        type: 'prefix_ambiguity',
        question: messages.question,
        no_match_1: messages.no_match_1!,
        no_match_2: messages.no_match_2!,
        no_match_3: messages.no_match_3!,
        parent_item: slot,
        child_items: childItems,
      });
      continue;
    }

    const children = getDirectChildSlots(slots, slot);
    nodes.push({
      slot,
      type: 'sibling_choice',
      question: messages.question,
      no_match_1: messages.no_match_1!,
      no_match_2: messages.no_match_2!,
      no_match_3: messages.no_match_3!,
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

/** Serializes ontology: item paths, corpus rows (category-ordered), dialog nodes. */
export function buildConvaiOntologyExport(input: ConvaiExportInput): ConvaiOntologyExport {
  const { rows: segRows, leafPaths } = segmentAllDescriptions(
    input.descriptions,
    input.dictionary.tokens,
    input.dictionary.categories ?? [],
  );

  const analysisRows = input.analysis?.rows ?? [];
  const slots = analysisRows.map((r) => r.slot_filling);
  const explicitPaths = input.analysis?.item_paths;
  const itemPaths = slots.length > 0
    ? reconcileItemPaths(slots, explicitPaths ?? leafPaths)
    : normalizeItemPaths(leafPaths);

  const corpusByPath = new Map<string, string>();
  const corpusItems: ConvaiCorpusItem[] = segRows.map((row) => {
    if (!corpusByPath.has(row.path)) {
      corpusByPath.set(row.path, row.sourceText);
    }
    const segmented = segmentDescription(
      row.sourceText,
      input.dictionary.tokens,
      input.dictionary.categories ?? [],
    );
    return {
      path: row.path,
      source_text: row.sourceText,
      segments: segmented.segments,
      unmatched: row.unmatched,
    };
  });

  return {
    meta: buildMeta(input),
    item_paths: itemPaths,
    corpus_items: corpusItems,
    interactive_nodes: buildInteractiveNodes(analysisRows, itemPaths),
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
}

/** Compiles the Convai agent system prompt (motor rules + dialog protocol). */
export function compileConvaiSystemPrompt(input: ConvaiSystemPromptInput): string {
  const lines: string[] = [
    'Sei un assistente vocale per la prenotazione di prestazioni mediche.',
    `Dominio: ${input.documentName}. Lingua: italiano.`,
    '',
    'CONOSCENZA',
    '- Usa SOLO i dati nella knowledge base: dizionario (token), ontologia (item_paths, corpus_items, interactive_nodes, leaf_data).',
    '- Non inventare prestazioni, segmenti o categorie fuori catalogo.',
    '',
    'MOTORE DI SELEZIONE (equivalente al terminologo)',
    '1. Dalla frase utente riconosci quali token del dizionario sono presenti (canonical + alias), con flessibilità morfologica italiana.',
    '2. NON costruire path nuovi: scegli solo tra item_paths definiti nell\'ontologia.',
    '3. Per ogni item_path conta quanti segmenti/nodi del path sono evidenziati nel testo (usa i segmenti pre-ordinati in corpus_items come riferimento).',
    '4. Vince l\'item con il conteggio più alto.',
    '5. Se padre-item e figlio-item hanno lo stesso conteggio → preferisci il padre-item (prefix ambiguity).',
    '6. Accumula le frasi dell\'utente nel corso della conversazione prima di ricalcolare il match.',
    '',
    'NAVIGAZIONE DIALOGO',
    '7. Nodo con un solo figlio e NON prefix_ambiguity → trasparente, prosegui senza domanda.',
    '8. prefix_ambiguity (padre-item + figlio-item) → fai la question del PADRE in interactive_nodes.',
    '9. sibling_choice (2+ figli) → fai la question del nodo interattivo corrispondente.',
    '10. Item terminale → conferma con confirmation_text da leaf_data (prefisso opzionale da confirmation_preamble).',
    '11. Parafrasa le domande in modo naturale; non cambiare il significato clinico né le opzioni.',
    '12. Se non capisci: usa no_match_1, poi no_match_2, poi no_match_3 del nodo corrente.',
    '13. Tieni traccia del nodo interattivo corrente (currentPath) e se stai attendendo una disambiguazione.',
  ];

  if (input.startQuestion?.trim()) {
    lines.push('', 'APERTURA', `- Prima frase all\'utente (parafrasabile): ${input.startQuestion.trim()}`);
  }

  if (input.confirmationPreamble?.trim()) {
    lines.push('', 'CONFERMA', `- Prefisso conferma foglia: ${input.confirmationPreamble.trim()}`);
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
