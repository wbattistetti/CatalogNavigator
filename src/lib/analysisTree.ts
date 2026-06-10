/**
 * Tree utilities for slot-filling analysis rows (ordering, merge, validation).
 */
import type { AnalysisRow } from '../hooks/useAnalysis';
import { validateGrammarRegex } from './grammarNormalize';
import {
  isPrefixAmbiguityNode,
  isTerminalItemSlot,
  resolveItemPaths,
} from './itemPaths';

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
export function getAgentGenerationRoots(slots: string[]): string[] {
  const forest = getDirectChildSlots(slots, '').sort((a, b) => a.localeCompare(b, 'it'));
  if (forest.length !== 1) return forest;
  const children = getDirectChildSlots(slots, forest[0]!).sort((a, b) => a.localeCompare(b, 'it'));
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
export function buildDefaultStartQuestion(slots: string[]): string {
  const roots = getAgentGenerationRoots(slots);
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
export function sortAnalysisRows(rows: AnalysisRow[]): AnalysisRow[] {
  const slots = sortSlotsTreeOrder(rows.map((r) => r.slot_filling));
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
): boolean {
  const itemPaths = resolveItemPaths(slots, itemPathsInput);
  if (isTerminalItemSlot(slot, itemPaths)) return false;
  const children = getDirectChildSlots(slots, slot);
  if (children.length >= 2) return true;
  if (isPrefixAmbiguityNode(slots, slot, itemPaths)) return true;
  return false;
}

/** Paths that require an AI (or fallback) disambiguation question. */
export function getInteractiveMessageSlots(
  slots: string[],
  itemPathsInput?: string[] | null,
): string[] {
  return slots.filter((s) => isInteractiveMessageSlot(slots, s, itemPathsInput));
}

function isInteractiveSlot(slots: string[], slot: string, itemPathsInput?: string[] | null): boolean {
  return isInteractiveMessageSlot(slots, slot, itemPathsInput);
}

/** Returns internal nodes that are missing required NLU fields. */
export function findInvalidInternalNodes(
  slots: string[],
  rows: AnalysisRow[],
  itemPathsInput?: string[] | null,
): string[] {
  return findInvalidMessagesNodes(slots, rows, itemPathsInput);
}

/** Returns interactive nodes missing questions or re-prompts. */
export function findInvalidMessagesNodes(
  slots: string[],
  rows: AnalysisRow[],
  itemPathsInput?: string[] | null,
): string[] {
  const bySlot = indexRowsBySlot(rows);
  const invalid: string[] = [];
  for (const slot of slots) {
    if (!isInteractiveSlot(slots, slot, itemPathsInput)) continue;
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
): string[] {
  if (overwriteExisting) return subtreeSlots;
  return findInvalidGrammarNodes(subtreeSlots, rows);
}

/** True when a row has an agent question message. */
export function rowHasMessage(row: AnalysisRow): boolean {
  return !!row.question?.trim();
}

/** Returns nodes missing or syntactically invalid node/answer grammars. */
export function findInvalidGrammarNodes(
  slots: string[],
  rows: AnalysisRow[],
  itemPathsInput?: string[] | null,
): string[] {
  const itemPaths = resolveItemPaths(slots, itemPathsInput);
  const bySlot = indexRowsBySlot(rows);
  const invalid: string[] = [];
  for (const slot of slots) {
    const row = getRowBySlot(bySlot, slot);
    if (!row) {
      invalid.push(slot);
      continue;
    }
    const nodeOk = !!(
      row.grammar?.regex?.trim()
      && row.grammar.mappings
      && Object.keys(row.grammar.mappings).length > 0
      && validateGrammarRegex(row.grammar.regex, row.grammar.mappings).valid
    );
    const needsAnswer = isInteractiveSlot(slots, slot, itemPaths);
    const answerOk = !needsAnswer || !!(
      row.answer_grammar?.regex?.trim()
      && row.answer_grammar.mappings
      && Object.keys(row.answer_grammar.mappings).length > 0
      && validateGrammarRegex(row.answer_grammar.regex, row.answer_grammar.mappings).valid
    );
    if (!nodeOk || !answerOk) invalid.push(slot);
  }
  return invalid;
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

/** True when all nodes have grammars and interactive nodes have messages (ready for test). */
export function hasAgentContent(rows: AnalysisRow[]): boolean {
  const slots = rows.map((r) => r.slot_filling);
  if (slots.length === 0) return false;
  const interactive = slots.filter((s) => isInteractiveSlot(slots, s));
  const bySlot = indexRowsBySlot(rows);
  const itemPaths = resolveItemPaths(slots);
  const allGrammars = slots.every((slot) => {
    const row = getRowBySlot(bySlot, slot);
    if (!row?.grammar?.regex?.trim()
      || !row.grammar.mappings
      || Object.keys(row.grammar.mappings).length === 0) {
      return false;
    }
    if (isInteractiveSlot(slots, slot, itemPaths)) {
      return !!(
        row.answer_grammar?.regex?.trim()
        && row.answer_grammar.mappings
        && Object.keys(row.answer_grammar.mappings).length > 0
      );
    }
    return true;
  });
  if (!allGrammars) return false;
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

/** Sorts slot paths parent-before-child, alphabetical per level. */
export function sortSlotsTreeOrder(slots: string[]): string[] {
  return [...slots].sort((a, b) => {
    const depthDiff = a.split('.').length - b.split('.').length;
    if (depthDiff !== 0) return depthDiff;
    return a.localeCompare(b, 'it');
  });
}

/** DFS tree walk: each parent immediately followed by its subtree (forest order). */
export function orderSlotsDepthFirst(slots: string[]): string[] {
  const slotList = [...new Set(slots)];
  const ordered: string[] = [];

  const walk = (node: string) => {
    ordered.push(node);
    for (const child of getDirectChildSlots(slotList, node).sort((a, b) =>
      a.localeCompare(b, 'it'),
    )) {
      walk(child);
    }
  };

  for (const root of getDirectChildSlots(slotList, '').sort((a, b) =>
    a.localeCompare(b, 'it'),
  )) {
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
export function orderAnalysisRowsDepthFirst(rows: AnalysisRow[]): AnalysisRow[] {
  const ordered = orderSlotsDepthFirst(rows.map((r) => r.slot_filling));
  const bySlot = new Map(rows.map((r) => [r.slot_filling, r]));
  return ordered.map((slot) => {
    const row = bySlot.get(slot);
    if (!row) throw new Error(`Riga mancante per slot "${slot}"`);
    return row;
  });
}

/** Prompt section: only interactive paths — AI generates one row per listed path. */
export function formatInteractiveMessagesPrompt(
  slots: string[],
  itemPathsInput?: string[] | null,
): string {
  const itemPaths = resolveItemPaths(slots, itemPathsInput);
  const interactive = getInteractiveMessageSlots(slots, itemPathsInput);

  if (interactive.length === 0) {
    return 'Nessun nodo richiede domanda di disambiguazione in questo sottoalbero.\n';
  }

  const lines = interactive.map((slot) => {
    const children = getDirectChildSlots(slots, slot);
    const childNote = isPrefixAmbiguityNode(slots, slot, itemPaths)
      ? ' (disambiguazione: semplice vs estensione figlio-item)'
      : children.length <= 3
        ? ' (elenca opzioni nella domanda)'
        : ' (domanda aperta)';
    return `- ${slot}\n  figli diretti: ${children.join(', ')}${childNote}`;
  });

  return (
    `GENERA UNA RIGA PER OGNI PATH SOTTO (${interactive.length}) — slot_filling IDENTICO al path elencato.\n` +
    `Campi: slot_filling, question, grammar=null, no_match_1, no_match_2, no_match_3, status=null.\n` +
    `NON generare righe per altri slot: nodi trasparenti e item terminali sono compilati dal sistema.\n\n` +
    lines.join('\n')
  );
}

/** Describes which nodes require messages (questions + re-prompts). */
export function formatMessagesNodesSection(slots: string[], itemPathsInput?: string[] | null): string {
  const itemPaths = resolveItemPaths(slots, itemPathsInput);
  const passthrough = slots.filter((s) => !isLeafSlot(slots, s) && !isInteractiveSlot(slots, s, itemPaths));
  const terminalItems = slots.filter((s) => isTerminalItemSlot(s, itemPaths));

  return (
    formatInteractiveMessagesPrompt(slots, itemPathsInput) +
    `\nNODI TRASPARENTI (${passthrough.length}) — compilati automaticamente, NON inviare all'AI:\n` +
    `${passthrough.map((s) => `- ${s}`).join('\n')}\n\n` +
    `ITEM TERMINALI (${terminalItems.length}) — compilati automaticamente, NON inviare all'AI:\n` +
    `${terminalItems.map((s) => `- ${s}`).join('\n')}`
  );
}

function lastPathSegment(slot: string): string {
  const parts = slot.split('.');
  return parts[parts.length - 1] ?? slot;
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
export function formatInternalNodesSection(slots: string[], itemPathsInput?: string[] | null): string {
  const itemPaths = resolveItemPaths(slots, itemPathsInput);
  const internal = slots.filter((s) => isInteractiveSlot(slots, s, itemPaths));
  const passthrough = slots.filter((s) => !isLeafSlot(slots, s) && !isInteractiveSlot(slots, s, itemPaths));
  const terminalItems = slots.filter((s) => isTerminalItemSlot(s, itemPaths));

  const internalLines = internal.map((slot) => {
    const children = getDirectChildSlots(slots, slot);
    const childNote = isPrefixAmbiguityNode(slots, slot, itemPaths)
      ? ' (item con figlio-item → disambiguazione semplice vs estensione)'
      : children.length <= 3
        ? ' (2-3 figli → elenca opzioni nella domanda)'
        : ' (>=4 figli → domanda aperta)';
    return `- ${slot}\n  figli diretti: ${children.join(', ')}${childNote}`;
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
 * Sort order: parents before children, alphabetical per depth.
 */
export function expandLeafPathsToTree(leafPaths: string[]): string[] {
  const allPaths = new Set<string>();
  for (const raw of leafPaths) {
    const normalized = normalizeCompactPath(raw);
    if (!normalized) continue;
    const parts = normalized.split('.');
    for (let depth = 1; depth <= parts.length; depth++) {
      allPaths.add(parts.slice(0, depth).join('.'));
    }
  }
  return sortSlotsTreeOrder([...allPaths]);
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
