/**
 * Tree utilities for slot-filling analysis rows (ordering, merge, validation).
 */
import type { AnalysisRow } from '../hooks/useAnalysis';
import { compareTokenSegmentOrder, type TokenCategory } from './dictionaryTree';
import { findCategoriesMissingGrammar, isCategoryGrammarsLayerReady } from './categoryGrammar';
import {
  isPrefixAmbiguityNode,
  isTerminalItemSlot,
  resolveItemPaths,
} from './itemPaths';
import { requiresCategoryAwareInteractiveNode, getSiblingChoiceChildren } from './nluCategoryRules';

/** Unicode dash variants (e.g. pet‑tc from Word/PDF) → ASCII hyphen. */
const UNICODE_DASHES = /[\u2010\u2011\u2012\u2013\u2014\u2212]/g;

/** Normalizes a slot path for fuzzy matching (dashes, underscore ↔ space). */
export function normalizeSlotKey(slot: string): string {
  return slot
    .toLowerCase()
    .replace(UNICODE_DASHES, '-')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalizes an AI-returned slot path segment separators while keeping dots. */
export function normalizeSlotPathFromAi(slot: string): string {
  return slot
    .trim()
    .split('.')
    .map((part) => part.trim().replace(UNICODE_DASHES, '-'))
    .filter(Boolean)
    .join('.');
}

/** Normalizes user-edited path: trim, lowercase, clean segments. */
export function normalizeSlotPath(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .split('.')
    .map((s) => s.trim().replace(UNICODE_DASHES, '-'))
    .filter(Boolean)
    .join('.');
}

/** Splits an array into fixed-size chunks for batched IA calls. */
export function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/** Indexes rows by exact and normalized slot path. */
export function indexRowsBySlot(rows: AnalysisRow[]): Map<string, AnalysisRow> {
  const map = new Map<string, AnalysisRow>();
  for (const row of rows) {
    map.set(row.slot_filling, row);
    map.set(normalizeSlotKey(row.slot_filling), row);
  }
  return map;
}

/** Looks up a row by exact or normalized slot path. */
export function getRowBySlot(rowsBySlot: Map<string, AnalysisRow>, slot: string): AnalysisRow | undefined {
  return rowsBySlot.get(slot) ?? rowsBySlot.get(normalizeSlotKey(slot));
}

function lastPathSegment(slot: string): string {
  const parts = slot.split('.');
  return parts[parts.length - 1] ?? slot;
}

const localeSortSlots = (a: string, b: string) => a.localeCompare(b, 'it');

/**
 * Compares sibling slots for tree display: category tier/order on the last segment, then path.
 * Falls back to alphabetical when categories are missing.
 */
export function compareSiblingSlots(
  slotA: string,
  slotB: string,
  categories?: TokenCategory[],
): number {
  if (categories?.length) {
    const byCategory = compareTokenSegmentOrder(
      lastPathSegment(slotA),
      lastPathSegment(slotB),
      categories,
    );
    if (byCategory !== 0) return byCategory;
  }
  return localeSortSlots(slotA, slotB);
}

function sortSiblingSlots(slots: string[], categories?: TokenCategory[]): string[] {
  return [...slots].sort((a, b) => compareSiblingSlots(a, b, categories));
}

/** Returns direct child slot paths of a parent within a slot list. */
export function getDirectChildSlots(slots: string[], parentSlot: string): string[] {
  const prefix = parentSlot ? `${parentSlot}.` : '';
  return slots.filter((s) => {
    if (parentSlot && !s.startsWith(prefix)) return false;
    if (!parentSlot) return !s.includes('.');
    const rest = s.slice(prefix.length);
    return rest.length > 0 && !rest.includes('.');
  });
}

/** True when the slot has no children in the given slot list. */
export function isLeafSlot(slots: string[], slot: string): boolean {
  return getDirectChildSlots(slots, slot).length === 0;
}

/** Root slots used for incremental NLU generation (forest roots, or first-level children if single mega-root). */
export function getAgentGenerationRoots(
  slots: string[],
  categories?: TokenCategory[],
): string[] {
  const forest = sortSiblingSlots(getDirectChildSlots(slots, ''), categories);
  if (forest.length !== 1) return forest;
  const children = sortSiblingSlots(getDirectChildSlots(slots, forest[0]!), categories);
  return children.length > 1 ? children : forest;
}

function humanizeSegment(segment: string): string {
  return segment.replace(UNICODE_DASHES, '-').replace(/_/g, ' ');
}

function formatRootOptionsList(labels: string[]): string {
  if (labels.length === 2) return `${labels[0]} o ${labels[1]}`;
  if (labels.length === 3) return `${labels[0]}, ${labels[1]} o ${labels[2]}`;
  return labels.join(', ');
}

/**
 * Builds the global opening question that disambiguates among forest root nodes.
 * Used as start_question — separate from per-node questions in the tree.
 */
export function buildDefaultStartQuestion(
  slots: string[],
  categories?: TokenCategory[],
): string {
  const roots = getAgentGenerationRoots(slots, categories);
  const labels = roots.map((r) => humanizeSegment(lastPathSegment(r)));
  if (labels.length === 0) {
    return 'Buongiorno, quale esame o prestazione desidera prenotare?';
  }
  if (labels.length <= 4) {
    return `Buongiorno, quale prestazione desidera prenotare: ${formatRootOptionsList(labels)}?`;
  }
  return 'Buongiorno, quale esame o prestazione desidera prenotare?';
}

/** Collects a root slot and all its descendants from analysis rows. */
export function collectSubtreeSlots(rows: AnalysisRow[], rootSlot: string): string[] {
  return rows
    .filter((r) => r.slot_filling === rootSlot || r.slot_filling.startsWith(`${rootSlot}.`))
    .map((r) => r.slot_filling);
}

/** Descendant slot paths under a parent (excludes the parent itself). */
export function collectDescendantSlots(rows: AnalysisRow[], parentSlot: string): Set<string> {
  const prefix = `${parentSlot}.`;
  const out = new Set<string>();
  for (const row of rows) {
    if (row.slot_filling.startsWith(prefix)) out.add(row.slot_filling);
  }
  return out;
}

/** Direct child slot paths of a parent within analysis rows. */
export function collectDirectChildSlots(rows: AnalysisRow[], parentSlot: string): Set<string> {
  const slots = rows.map((r) => r.slot_filling);
  return new Set(getDirectChildSlots(slots, parentSlot));
}

/** Sorts rows in tree order (parents before children). */
export function sortAnalysisRows(
  rows: AnalysisRow[],
  categories?: TokenCategory[],
): AnalysisRow[] {
  const slots = sortSlotsTreeOrder(rows.map((r) => r.slot_filling), categories);
  const bySlot = new Map(rows.map((r) => [r.slot_filling, r]));
  return slots.map((s) => {
    const row = bySlot.get(s);
    if (!row) throw new Error(`Riga mancante per slot "${s}"`);
    return row;
  });
}

function emptyTaxonomyRow(slot_filling: string): AnalysisRow {
  return {
    slot_filling,
    question: null,
    grammar: null,
    answer_grammar: null,
    no_match_1: null,
    no_match_2: null,
    no_match_3: null,
    confirmation_text: null,
    status: null,
  };
}

function clearNluFields(row: AnalysisRow): AnalysisRow {
  return {
    ...row,
    question: null,
    grammar: null,
    answer_grammar: null,
    no_match_1: null,
    no_match_2: null,
    no_match_3: null,
    status: null,
  };
}

/**
 * Restructures a node path (add/remove `.` levels), updates descendants,
 * creates missing ancestors, and re-sorts the tree.
 */
export function restructureSlotPath(
  rows: AnalysisRow[],
  oldSlot: string,
  newPathRaw: string,
): AnalysisRow[] {
  const newSlot = normalizeSlotPath(newPathRaw);
  if (!newSlot) throw new Error('Path non valido');
  if (oldSlot === newSlot) return rows;

  if (rows.some((r) => r.slot_filling === newSlot && r.slot_filling !== oldSlot)) {
    throw new Error(`Il path "${newSlot}" esiste già`);
  }

  let updated = rows.map((r) => {
    if (r.slot_filling === oldSlot) {
      return clearNluFields({ ...r, slot_filling: newSlot });
    }
    if (r.slot_filling.startsWith(`${oldSlot}.`)) {
      return clearNluFields({
        ...r,
        slot_filling: newSlot + r.slot_filling.slice(oldSlot.length),
      });
    }
    return r;
  });

  const parts = newSlot.split('.');
  const slotSet = new Set(updated.map((r) => r.slot_filling));
  for (let i = 1; i < parts.length; i++) {
    const ancestor = parts.slice(0, i).join('.');
    if (!slotSet.has(ancestor)) {
      updated.push(emptyTaxonomyRow(ancestor));
      slotSet.add(ancestor);
    }
  }

  return sortAnalysisRows(updated);
}

/**
 * Replaces the subtree rooted at `rootSlot` with regened rows, preserving
 * tree order from the original rows array.
 * When `preserveComplete` is true, keeps existing rows that already have full NLU.
 */
export function mergeSubtreeRows(
  allRows: AnalysisRow[],
  regenedBySlot: Map<string, AnalysisRow>,
  rootSlot: string,
  preserveComplete = false,
  isNodeComplete?: (slot: string, row: AnalysisRow) => boolean,
): AnalysisRow[] {
  const subtreeSet = new Set(
    allRows
      .filter((r) => r.slot_filling === rootSlot || r.slot_filling.startsWith(`${rootSlot}.`))
      .map((r) => r.slot_filling),
  );

  const orderedSubtree = allRows
    .filter((r) => subtreeSet.has(r.slot_filling))
    .map((r) => {
      if (preserveComplete && isNodeComplete?.(r.slot_filling, r)) {
        return r;
      }
      const regened = getRowBySlot(regenedBySlot, r.slot_filling);
      if (!regened) throw new Error(`Rigenerazione incompleta: manca lo slot "${r.slot_filling}"`);
      return {
        ...regened,
        slot_filling: r.slot_filling,
        confirmation_text: regened.confirmation_text ?? r.confirmation_text ?? null,
        status: preserveComplete ? (r.status ?? null) : (null as AnalysisRow['status']),
      };
    });

  const result: AnalysisRow[] = [];
  let inserted = false;
  for (const row of allRows) {
    if (subtreeSet.has(row.slot_filling)) {
      if (!inserted) {
        result.push(...orderedSubtree);
        inserted = true;
      }
    } else {
      result.push(row);
    }
  }
  return result;
}

function mergeSubtreeLayerRows(
  allRows: AnalysisRow[],
  regenedBySlot: Map<string, AnalysisRow>,
  rootSlot: string,
  preserveComplete: boolean,
  isNodeComplete: ((slot: string, row: AnalysisRow) => boolean) | undefined,
  pickFields: (existing: AnalysisRow, regened: AnalysisRow) => AnalysisRow,
): AnalysisRow[] {
  const subtreeSet = new Set(
    allRows
      .filter((r) => r.slot_filling === rootSlot || r.slot_filling.startsWith(`${rootSlot}.`))
      .map((r) => r.slot_filling),
  );

  const orderedSubtree = allRows
    .filter((r) => subtreeSet.has(r.slot_filling))
    .map((r) => {
      if (preserveComplete && isNodeComplete?.(r.slot_filling, r)) return r;
      const regened = getRowBySlot(regenedBySlot, r.slot_filling);
      if (!regened) throw new Error(`Rigenerazione incompleta: manca lo slot "${r.slot_filling}"`);
      return pickFields(r, regened);
    });

  const result: AnalysisRow[] = [];
  let inserted = false;
  for (const row of allRows) {
    if (subtreeSet.has(row.slot_filling)) {
      if (!inserted) {
        result.push(...orderedSubtree);
        inserted = true;
      }
    } else {
      result.push(row);
    }
  }
  return result;
}

/** Merges messages layer into existing rows, preserving grammars. */
export function mergeSubtreeMessageRows(
  allRows: AnalysisRow[],
  regenedBySlot: Map<string, AnalysisRow>,
  rootSlot: string,
  preserveComplete = false,
  isNodeComplete?: (slot: string, row: AnalysisRow) => boolean,
): AnalysisRow[] {
  return mergeSubtreeLayerRows(allRows, regenedBySlot, rootSlot, preserveComplete, isNodeComplete, (existing, regened) => ({
    ...existing,
    question: regened.question?.trim() || existing.question,
    no_match_1: regened.no_match_1?.trim() || existing.no_match_1,
    no_match_2: regened.no_match_2?.trim() || existing.no_match_2,
    no_match_3: regened.no_match_3?.trim() || existing.no_match_3,
    status: preserveComplete ? (existing.status ?? null) : null,
  }));
}

/** Merges grammars layer into existing rows, preserving messages. */
export function mergeSubtreeGrammarRows(
  allRows: AnalysisRow[],
  regenedBySlot: Map<string, AnalysisRow>,
  rootSlot: string,
  preserveComplete = false,
  isNodeComplete?: (slot: string, row: AnalysisRow) => boolean,
): AnalysisRow[] {
  return mergeSubtreeLayerRows(allRows, regenedBySlot, rootSlot, preserveComplete, isNodeComplete, (existing, regened) => ({
    ...existing,
    grammar: regened.grammar,
    answer_grammar: regened.answer_grammar ?? null,
    status: preserveComplete ? (existing.status ?? null) : null,
  }));
}

/** True when a path needs a disambiguation question (unique per slot_filling). */
export function isInteractiveMessageSlot(
  slots: string[],
  slot: string,
  itemPathsInput?: string[] | null,
  categories?: TokenCategory[],
): boolean {
  const itemPaths = resolveItemPaths(slots, itemPathsInput);
  return requiresCategoryAwareInteractiveNode(slots, slot, itemPaths, categories);
}

/** Paths that require an AI (or fallback) disambiguation question. */
export function getInteractiveMessageSlots(
  slots: string[],
  itemPathsInput?: string[] | null,
  categories?: TokenCategory[],
): string[] {
  return slots.filter((s) => isInteractiveMessageSlot(slots, s, itemPathsInput, categories));
}

function isInteractiveSlot(
  slots: string[],
  slot: string,
  itemPathsInput?: string[] | null,
  categories?: TokenCategory[],
): boolean {
  return isInteractiveMessageSlot(slots, slot, itemPathsInput, categories);
}

/** Returns internal nodes that are missing required NLU fields. */
export function findInvalidInternalNodes(
  slots: string[],
  rows: AnalysisRow[],
  itemPathsInput?: string[] | null,
  categories?: TokenCategory[],
): string[] {
  return findInvalidMessagesNodes(slots, rows, itemPathsInput, categories);
}

/** Returns interactive nodes missing questions or re-prompts. */
export function findInvalidMessagesNodes(
  slots: string[],
  rows: AnalysisRow[],
  itemPathsInput?: string[] | null,
  categories?: TokenCategory[],
): string[] {
  const bySlot = indexRowsBySlot(rows);
  const invalid: string[] = [];
  for (const slot of slots) {
    if (!isInteractiveSlot(slots, slot, itemPathsInput, categories)) continue;
    const row = getRowBySlot(bySlot, slot);
    if (!row?.question?.trim()
      || !row.no_match_1?.trim()
      || !row.no_match_2?.trim()
      || !row.no_match_3?.trim()) {
      invalid.push(slot);
    }
  }
  return invalid;
}

/** Slots that need grammar generation (all subtree slots or only missing). */
export function getGrammarTargetSlots(
  subtreeSlots: string[],
  rows: AnalysisRow[],
  overwriteExisting: boolean,
  itemPathsInput?: string[] | null,
  categories?: TokenCategory[],
): string[] {
  if (overwriteExisting) return subtreeSlots;
  return findInvalidGrammarNodes(subtreeSlots, rows, itemPathsInput, categories);
}

/** True when a row has an agent question message. */
export function rowHasMessage(row: AnalysisRow): boolean {
  return !!row.question?.trim();
}

/** Returns attributo category names missing or with invalid grammars. */
export function findInvalidCategoryGrammars(categories: TokenCategory[]): string[] {
  return findCategoriesMissingGrammar(categories);
}

/** @deprecated Use findInvalidCategoryGrammars — node grammars are no longer used. */
export function findInvalidGrammarNodes(
  _slots: string[],
  _rows: AnalysisRow[],
  _itemPathsInput?: string[] | null,
  categories?: TokenCategory[],
): string[] {
  if (!categories?.length) return ['categories'];
  return findInvalidCategoryGrammars(categories);
}

/** True when at least one interactive node has a question (or multi-root start question). */
export function hasMessagesContent(
  rows: AnalysisRow[],
  itemPathsInput?: string[] | null,
  startQuestion?: string | null,
): boolean {
  const slots = rows.map((r) => r.slot_filling);
  if (getAgentGenerationRoots(slots).length > 1 && startQuestion?.trim()) return true;
  return rows.some(
    (r) => isInteractiveSlot(slots, r.slot_filling, itemPathsInput) && !!r.question?.trim(),
  );
}

/** True when category grammars and interactive messages are ready for agent test. */
export function hasAgentContent(rows: AnalysisRow[], categories?: TokenCategory[]): boolean {
  const slots = rows.map((r) => r.slot_filling);
  if (slots.length === 0) return false;
  if (categories?.length && !isCategoryGrammarsLayerReady(categories)) return false;

  const interactive = slots.filter((s) => isInteractiveSlot(slots, s));
  const bySlot = indexRowsBySlot(rows);
  if (interactive.length === 0) return true;
  return interactive.every((slot) => {
    const row = getRowBySlot(bySlot, slot);
    if (!row) return false;
    return !!(
      row.question?.trim()
      && row.no_match_1?.trim()
      && row.no_match_2?.trim()
      && row.no_match_3?.trim()
    );
  });
}

/** Sorts slot path strings for storage (depth first, then category order among siblings). */
export function sortSlotsTreeOrder(
  slots: string[],
  categories?: TokenCategory[],
): string[] {
  return [...slots].sort((a, b) => {
    const depthDiff = a.split('.').length - b.split('.').length;
    if (depthDiff !== 0) return depthDiff;
    return compareSiblingSlots(a, b, categories);
  });
}

/** DFS tree walk: each parent immediately followed by its subtree (forest order). */
export function orderSlotsDepthFirst(
  slots: string[],
  categories?: TokenCategory[],
): string[] {
  const slotList = [...new Set(slots)];
  const ordered: string[] = [];

  const walk = (node: string) => {
    ordered.push(node);
    for (const child of sortSiblingSlots(getDirectChildSlots(slotList, node), categories)) {
      walk(child);
    }
  };

  for (const root of sortSiblingSlots(getDirectChildSlots(slotList, ''), categories)) {
    walk(root);
  }

  return ordered;
}

/** Slots that have at least one direct child in the row list. */
export function slotsWithDirectChildren(rows: AnalysisRow[]): Set<string> {
  const parents = new Set<string>();
  for (const row of rows) {
    const parts = row.slot_filling.split('.');
    if (parts.length > 1) {
      parents.add(parts.slice(0, -1).join('.'));
    }
  }
  return parents;
}

/** True when any ancestor slot is collapsed. */
export function isSlotHiddenByCollapse(slot: string, collapsed: ReadonlySet<string>): boolean {
  const parts = slot.split('.');
  for (let i = 1; i < parts.length; i++) {
    if (collapsed.has(parts.slice(0, i).join('.'))) return true;
  }
  return false;
}

/** Reorders analysis rows in DFS tree order for display and persistence. */
export function orderAnalysisRowsDepthFirst(
  rows: AnalysisRow[],
  categories?: TokenCategory[],
): AnalysisRow[] {
  const ordered = orderSlotsDepthFirst(rows.map((r) => r.slot_filling), categories);
  const bySlot = new Map(rows.map((r) => [r.slot_filling, r]));
  return ordered.map((slot) => {
    const row = bySlot.get(slot);
    if (!row) throw new Error(`Riga mancante per slot "${slot}"`);
    return row;
  });
}

function listDisambiguationChildren(
  slots: string[],
  slot: string,
  categories?: TokenCategory[],
): string[] {
  if (categories?.length) {
    return getSiblingChoiceChildren(slots, slot, categories) ?? [];
  }
  return getDirectChildSlots(slots, slot);
}

/** Prompt section: only interactive paths — AI generates one row per listed path. */
export function formatInteractiveMessagesPrompt(
  slots: string[],
  itemPathsInput?: string[] | null,
  categories?: TokenCategory[],
): string {
  const itemPaths = resolveItemPaths(slots, itemPathsInput);
  const interactive = getInteractiveMessageSlots(slots, itemPathsInput, categories);

  if (interactive.length === 0) {
    return 'Nessun nodo richiede domanda di disambiguazione in questo sottoalbero.\n';
  }

  const lines = interactive.map((slot) => {
    const children = listDisambiguationChildren(slots, slot, categories);
    const childNote = isPrefixAmbiguityNode(slots, slot, itemPaths)
      ? ' (disambiguazione: semplice vs estensione figlio-item)'
      : children.length <= 3
        ? ' (elenca opzioni nella domanda)'
        : ' (domanda aperta)';
    return `- ${slot}\n  opzioni disambiguazione: ${children.join(', ')}${childNote}`;
  });

  return (
    `GENERA UNA RIGA PER OGNI PATH SOTTO (${interactive.length}) — slot_filling IDENTICO al path elencato.\n` +
    `Campi: slot_filling, question, grammar=null, no_match_1, no_match_2, no_match_3, status=null.\n` +
    `NON generare righe per altri slot: nodi trasparenti e item terminali sono compilati dal sistema.\n\n` +
    lines.join('\n')
  );
}

/** Describes which nodes require messages (questions + re-prompts). */
export function formatMessagesNodesSection(
  slots: string[],
  itemPathsInput?: string[] | null,
  categories?: TokenCategory[],
): string {
  const itemPaths = resolveItemPaths(slots, itemPathsInput);
  const passthrough = slots.filter((s) => !isLeafSlot(slots, s) && !isInteractiveSlot(slots, s, itemPaths, categories));
  const terminalItems = slots.filter((s) => isTerminalItemSlot(s, itemPaths));

  return (
    formatInteractiveMessagesPrompt(slots, itemPathsInput, categories) +
    `\nNODI TRASPARENTI (${passthrough.length}) — compilati automaticamente, NON inviare all'AI:\n` +
    `${passthrough.map((s) => `- ${s}`).join('\n')}\n\n` +
    `ITEM TERMINALI (${terminalItems.length}) — compilati automaticamente, NON inviare all'AI:\n` +
    `${terminalItems.map((s) => `- ${s}`).join('\n')}`
  );
}

/** Describes every node for per-node synonym grammar generation. */
export function formatGrammarsNodesSection(slots: string[], rows: AnalysisRow[]): string {
  const bySlot = indexRowsBySlot(rows);
  const lines = slots.map((slot) => {
    const row = getRowBySlot(bySlot, slot);
    const segment = lastPathSegment(slot);
    const question = row?.question?.trim();
    const note = question ? `domanda figli: "${question}"` : 'foglia o nodo senza domanda';
    return (
      `- ${slot}\n` +
      `  segmento: "${segment}"\n` +
      `  ${note}\n` +
      `  mappings DEVE puntare a: "${slot}" (il path di QUESTO nodo, non ai figli)`
    );
  });

  return (
    `OGNI NODO (${slots.length}) — grammar OBBLIGATORIA con sinonimi per riconoscere QUESTO nodo.\n` +
    `Il motore prova tutte le grammatiche: per ogni item corpus conta i match sul path; vince l'item con più match.\n` +
    `question=null, no_match=null.\n\n` +
    lines.join('\n\n')
  );
}

/** Describes which nodes require questions vs which are leaves. */
export function formatInternalNodesSection(
  slots: string[],
  itemPathsInput?: string[] | null,
  categories?: TokenCategory[],
): string {
  const itemPaths = resolveItemPaths(slots, itemPathsInput);
  const internal = slots.filter((s) => isInteractiveSlot(slots, s, itemPaths, categories));
  const passthrough = slots.filter((s) => !isLeafSlot(slots, s) && !isInteractiveSlot(slots, s, itemPaths, categories));
  const terminalItems = slots.filter((s) => isTerminalItemSlot(s, itemPaths));

  const internalLines = internal.map((slot) => {
    const children = listDisambiguationChildren(slots, slot, categories);
    const childNote = isPrefixAmbiguityNode(slots, slot, itemPaths)
      ? ' (item con figlio-item → disambiguazione semplice vs estensione)'
      : children.length <= 3
        ? ' (2-3 figli → elenca opzioni nella domanda)'
        : ' (>=4 figli → domanda aperta)';
    return `- ${slot}\n  opzioni disambiguazione: ${children.join(', ')}${childNote}`;
  });

  const passthroughLines = passthrough.map((s) => `- ${s}`);
  const itemLines = terminalItems.map((s) => `- ${s}`);

  return (
    `NODI INTERNI (${internal.length}) — question, grammar, no_match OBBLIGATORI:\n` +
    `${internalLines.join('\n')}\n\n` +
    `NODI TRASPARENTI (${passthrough.length}) — question=null, grammar=null, no_match=null:\n` +
    `${passthroughLines.join('\n')}\n\n` +
    `ITEM TERMINALI (${terminalItems.length}) — question=null, grammar=null, no_match=null:\n` +
    `${itemLines.join('\n')}`
  );
}

/** Normalizes a compact dotted path (lowercase, clean segments). */
export function normalizeCompactPath(path: string): string {
  return path
    .trim()
    .toLowerCase()
    .split('.')
    .map((s) => s.trim())
    .filter(Boolean)
    .join('.');
}

/**
 * Expands compact leaf paths to a full tree by adding all ancestor prefixes.
 * Sort order: parents before children; siblings by dictionary category.order.
 */
export function expandLeafPathsToTree(
  leafPaths: string[],
  categories?: TokenCategory[],
): string[] {
  const allPaths = new Set<string>();
  for (const raw of leafPaths) {
    const normalized = normalizeCompactPath(raw);
    if (!normalized) continue;
    const parts = normalized.split('.');
    for (let depth = 1; depth <= parts.length; depth++) {
      allPaths.add(parts.slice(0, depth).join('.'));
    }
  }
  return sortSlotsTreeOrder([...allPaths], categories);
}

/** Returns only leaf paths from a full slot list. */
export function extractLeafPaths(slots: string[]): string[] {
  return slots.filter((s) => isLeafSlot(slots, s));
}

/** Builds a human-readable indented tree from flat slot paths. */
export function formatSlotTree(slots: string[]): string {
  const sorted = [...slots].sort((a, b) => a.localeCompare(b));
  return sorted
    .map((slot) => {
      const depth = slot.split('.').length - 1;
      return `${'  '.repeat(depth)}${slot}`;
    })
    .join('\n');
}

/** Forest root depth: 0 with multiple top-level roots, 1 when a single wrapper root exists. */
export function analysisForestLevel(rows: AnalysisRow[]): number {
  const rootNodes = rows.filter((r) => !r.slot_filling.includes('.'));
  return rootNodes.length === 1 ? 1 : 0;
}

/** Slot path of the forest root that owns `slot` (top-level branch). */
export function analysisForestRootSlot(slot: string, forestLevel: number): string {
  const parts = slot.split('.');
  return parts.slice(0, forestLevel + 1).join('.');
}

/** Rows at forest-root depth (branches shown as separate trees in the UI). */
export function analysisForestRootRows(rows: AnalysisRow[]): AnalysisRow[] {
  const forestLevel = analysisForestLevel(rows);
  return rows.filter((r) => r.slot_filling.split('.').length - 1 === forestLevel);
}
