/**
 * Deterministic NLU question rules: passthrough single-child nodes, option listing for 2–3 children.
 */
import type { AnalysisRow } from '../hooks/useAnalysis';
import {
  collectSubtreeSlots,
  getDirectChildSlots,
  getRowBySlot,
  indexRowsBySlot,
  isLeafSlot,
} from './analysisTree';
import { validateGrammarRegex } from './grammarNormalize';

/** True when an internal node has exactly one child and must not ask a question. */
export function isPassthroughNode(slots: string[], slot: string): boolean {
  if (isLeafSlot(slots, slot)) return false;
  return getDirectChildSlots(slots, slot).length === 1;
}

/** True when an internal node requires question + grammar. */
export function requiresInteractiveNode(slots: string[], slot: string): boolean {
  if (isLeafSlot(slots, slot)) return false;
  return getDirectChildSlots(slots, slot).length !== 1;
}

function lastSegment(slot: string): string {
  const parts = slot.split('.');
  return parts[parts.length - 1] ?? slot;
}

function formatOptionsList(children: string[]): string {
  const labels = children.map(lastSegment);
  if (labels.length === 2) return `${labels[0]} o ${labels[1]}`;
  if (labels.length === 3) return `${labels[0]}, ${labels[1]} o ${labels[2]}`;
  return labels.join(', ');
}

function questionListsOptions(question: string, children: string[]): boolean {
  const q = question.toLowerCase();
  return children.every((c) => q.includes(lastSegment(c).toLowerCase()));
}

function buildOptionsQuestion(
  slot: string,
  children: string[],
  existingQuestion: string | null,
): string {
  const options = formatOptionsList(children);
  const base = existingQuestion?.trim()
    ? existingQuestion.trim().replace(/\?+\s*$/, '').trim()
    : `Quale ${lastSegment(slot)} desidera`;
  if (questionListsOptions(`${base}?`, children)) return `${base}?`;
  return `${base}: ${options}?`;
}

function clearedNluFields(): Pick<
  AnalysisRow,
  'question' | 'grammar' | 'no_match_1' | 'no_match_2' | 'no_match_3'
> {
  return {
    question: null,
    grammar: null,
    no_match_1: null,
    no_match_2: null,
    no_match_3: null,
  };
}

/** Applies passthrough clearing and option-list enrichment to NLU rows. */
export function applyNluQuestionRules(slots: string[], rows: AnalysisRow[]): AnalysisRow[] {
  return rows.map((row) => {
    const slot = row.slot_filling;
    if (isLeafSlot(slots, slot)) return row;

    const children = getDirectChildSlots(slots, slot);

    if (children.length === 1) {
      return { ...row, ...clearedNluFields(), status: row.status ?? null };
    }

    if (children.length >= 2 && children.length <= 3) {
      return {
        ...row,
        question: buildOptionsQuestion(slot, children, row.question),
        status: row.status ?? null,
      };
    }

    return row;
  });
}

/** Walks passthrough single-child nodes to the first interactive or leaf node. */
export function resolveNavigationTarget(
  path: string,
  rows: AnalysisRow[],
): { path: string; row: AnalysisRow; isLeaf: boolean } {
  const slots = rows.map((r) => r.slot_filling);
  let current = path;

  while (true) {
    const row = rows.find((r) => r.slot_filling === current);
    if (!row) {
      const fallback = rows.find((r) => r.slot_filling === path)!;
      return { path, row: fallback, isLeaf: isLeafSlot(slots, path) };
    }

    if (isLeafSlot(slots, current)) {
      return { path: current, row, isLeaf: true };
    }

    const children = getDirectChildSlots(slots, current);
    if (children.length === 1 && !row.question?.trim()) {
      current = children[0]!;
      continue;
    }

    return { path: current, row, isLeaf: false };
  }
}

/** True when interactive node has question + re-prompts (or is leaf / passthrough). */
export function isMessagesNodeComplete(slots: string[], slot: string, row: AnalysisRow): boolean {
  if (isLeafSlot(slots, slot)) return true;
  if (isPassthroughNode(slots, slot)) {
    return !row.question?.trim()
      && !row.no_match_1?.trim()
      && !row.no_match_2?.trim()
      && !row.no_match_3?.trim();
  }
  return !!(
    row.question?.trim()
    && row.no_match_1?.trim()
    && row.no_match_2?.trim()
    && row.no_match_3?.trim()
  );
}

/** True when a node has its own recognition grammar (every node in the tree). */
export function isGrammarNodeComplete(_slots: string[], _slot: string, row: AnalysisRow): boolean {
  return !!(
    row.grammar?.regex?.trim()
    && row.grammar.mappings
    && Object.keys(row.grammar.mappings).length > 0
  );
}

/** True when a node has all required NLU fields (messages + grammars). */
export function isNluNodeComplete(slots: string[], slot: string, row: AnalysisRow): boolean {
  return isMessagesNodeComplete(slots, slot, row) && isGrammarNodeComplete(slots, slot, row);
}

function isSubtreeLayerComplete(
  rows: AnalysisRow[],
  rootSlot: string,
  isComplete: (slots: string[], slot: string, row: AnalysisRow) => boolean,
): boolean {
  const slots = rows.map((r) => r.slot_filling);
  const subtreeSlots = collectSubtreeSlots(rows, rootSlot);
  const bySlot = indexRowsBySlot(rows);
  return subtreeSlots.every((slot) => {
    const row = getRowBySlot(bySlot, slot);
    if (!row) return false;
    return isComplete(slots, slot, row);
  });
}

/** True when every slot in a subtree has complete messages. */
export function isSubtreeMessagesComplete(rows: AnalysisRow[], rootSlot: string): boolean {
  return isSubtreeLayerComplete(rows, rootSlot, isMessagesNodeComplete);
}

/** True when every slot in a subtree has complete grammars. */
export function isSubtreeGrammarsComplete(rows: AnalysisRow[], rootSlot: string): boolean {
  return isSubtreeLayerComplete(rows, rootSlot, isGrammarNodeComplete);
}

/** True when every slot in a subtree has complete NLU (nothing left to generate). */
export function isSubtreeNluComplete(rows: AnalysisRow[], rootSlot: string): boolean {
  return isSubtreeLayerComplete(rows, rootSlot, isNluNodeComplete);
}

/** True when every node has a syntactically valid recognition grammar. */
export function isGrammarsLayerReady(rows: AnalysisRow[]): boolean {
  const slots = rows.map((r) => r.slot_filling);
  const bySlot = indexRowsBySlot(rows);
  if (slots.length === 0) return false;
  return slots.every((slot) => {
    const row = getRowBySlot(bySlot, slot);
    if (!row || !isGrammarNodeComplete(slots, slot, row)) return false;
    return validateGrammarRegex(row.grammar!.regex, row.grammar!.mappings).valid;
  });
}

/** True when all interactive nodes have messages (ready for grammar pass). */
export function isMessagesLayerReady(rows: AnalysisRow[]): boolean {
  const slots = rows.map((r) => r.slot_filling);
  const interactive = slots.filter((s) => requiresInteractiveNode(slots, s));
  if (interactive.length === 0) return false;
  const bySlot = indexRowsBySlot(rows);
  return interactive.every((slot) => {
    const row = getRowBySlot(bySlot, slot);
    return row && isMessagesNodeComplete(slots, slot, row);
  });
}

/** Re-applies saved NLU fields onto a fresh taxonomy for the same slot paths. */
export function mergeTaxonomyWithExistingNlu(
  taxonomyRows: AnalysisRow[],
  existingRows?: AnalysisRow[] | null,
): AnalysisRow[] {
  if (!existingRows?.length) return taxonomyRows;
  const bySlot = indexRowsBySlot(existingRows);
  return taxonomyRows.map((row) => {
    const saved = getRowBySlot(bySlot, row.slot_filling);
    if (!saved) return row;
    return {
      ...row,
      question: saved.question,
      grammar: saved.grammar,
      no_match_1: saved.no_match_1,
      no_match_2: saved.no_match_2,
      no_match_3: saved.no_match_3,
      confirmation_text: saved.confirmation_text ?? null,
      status: saved.status ?? null,
    };
  });
}

/** Finds the first node where the user must answer (from a root path). */
export function findFirstInteractivePath(
  rows: AnalysisRow[],
  startPath: string,
): { path: string; question: string | null } {
  const resolved = resolveNavigationTarget(startPath, rows);
  return {
    path: resolved.path,
    question: resolved.isLeaf ? null : resolved.row.question,
  };
}
