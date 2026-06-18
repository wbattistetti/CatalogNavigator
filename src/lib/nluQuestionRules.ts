/**
 * NLU question rules: sibling choice, vincolo age questions, structural passthrough.
 */
import type { AnalysisRow } from '../hooks/useAnalysis';
import {
  collectSubtreeSlots,
  getAgentGenerationRoots,
  getDirectChildSlots,
  getRowBySlot,
  indexRowsBySlot,
  isLeafSlot,
} from './analysisTree';
import {
  isCategoryGrammarsLayerReady,
} from './categoryGrammar';
import {
  isItemSlot,
  isTerminalItemSlot,
  resolveItemPaths,
} from './itemPaths';
import { AGE_YEARS_QUESTION } from './constraintValidation';
import type { TokenCategory } from './dictionaryTree';
import {
  getSiblingChoiceChildren,
  requiresCategoryAwareInteractiveNode,
  requiresVincoloSegmentQuestionNode,
} from './nluCategoryRules';

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
  'question' | 'grammar' | 'answer_grammar' | 'no_match_1' | 'no_match_2' | 'no_match_3'
> {
  return {
    question: null,
    grammar: null,
    answer_grammar: null,
    no_match_1: null,
    no_match_2: null,
    no_match_3: null,
  };
}

/** Clears NLU fields on nodes whose tree structure changed and need regeneration. */
export function invalidateNluAtSlots(
  rows: AnalysisRow[],
  slotsToInvalidate: string[],
): AnalysisRow[] {
  const targets = new Set(slotsToInvalidate.filter((s) => s.length > 0));
  if (targets.size === 0) return rows;
  return rows.map((row) => {
    if (!targets.has(row.slot_filling)) return row;
    return { ...row, ...clearedNluFields(), status: null };
  });
}

/** True when an internal node is structural-only (single child, no disambiguation). */
export function isPassthroughNode(
  slots: string[],
  slot: string,
  itemPathsInput?: string[] | null,
  categories?: TokenCategory[],
): boolean {
  if (isLeafSlot(slots, slot)) return false;
  return !requiresInteractiveNode(slots, slot, itemPathsInput, categories);
}

/** True when a node requires a question (same-category sibling choice or direct prefix-item). */
export function requiresInteractiveNode(
  slots: string[],
  slot: string,
  itemPathsInput?: string[] | null,
  categories?: TokenCategory[],
): boolean {
  const itemPaths = resolveItemPaths(slots, itemPathsInput);
  return requiresCategoryAwareInteractiveNode(slots, slot, itemPaths, categories);
}

/** Applies passthrough clearing, option lists, and prefix disambiguation questions. */
export function applyNluQuestionRules(
  slots: string[],
  rows: AnalysisRow[],
  itemPathsInput?: string[] | null,
  categories?: TokenCategory[],
): AnalysisRow[] {
  const itemPaths = resolveItemPaths(slots, itemPathsInput);
  return rows.map((row) => {
    const slot = row.slot_filling;

    if (requiresVincoloSegmentQuestionNode(slot, itemPaths, categories)) {
      return {
        ...row,
        question: AGE_YEARS_QUESTION,
        status: row.status ?? null,
      };
    }

    if (isTerminalItemSlot(slot, itemPaths)) return row;

    const children = getSiblingChoiceChildren(slots, slot, categories);
    if (!children || children.length < 2) {
      return { ...row, ...clearedNluFields(), status: row.status ?? null };
    }

    if (children.length <= 3) {
      if (row.question?.trim() && questionListsOptions(row.question, children)) return row;
      return {
        ...row,
        question: buildOptionsQuestion(slot, children, row.question),
        status: row.status ?? null,
      };
    }

    return row;
  });
}

/** Walks passthrough nodes to the first interactive or terminal item. */
export function resolveNavigationTarget(
  path: string,
  rows: AnalysisRow[],
  itemPathsInput?: string[] | null,
  categories?: TokenCategory[],
): { path: string; row: AnalysisRow; isLeaf: boolean } {
  const slots = rows.map((r) => r.slot_filling);
  const itemPaths = resolveItemPaths(slots, itemPathsInput);
  let current = path;

  while (true) {
    const row = rows.find((r) => r.slot_filling === current);
    if (!row) {
      const fallback = rows.find((r) => r.slot_filling === path)!;
      return {
        path,
        row: fallback,
        isLeaf: isTerminalItemSlot(path, itemPaths) || isLeafSlot(slots, path),
      };
    }

    if (isTerminalItemSlot(current, itemPaths)) {
      return { path: current, row, isLeaf: true };
    }

    if (isLeafSlot(slots, current) && !isItemSlot(current, itemPaths)) {
      return { path: current, row, isLeaf: true };
    }

    if (requiresInteractiveNode(slots, current, itemPaths, categories)) {
      return { path: current, row, isLeaf: false };
    }

    const children = getDirectChildSlots(slots, current);
    if (children.length === 1) {
      current = children[0]!;
      continue;
    }

    return { path: current, row, isLeaf: false };
  }
}

/** True when interactive node has question + re-prompts (or is terminal item / passthrough). */
export function isMessagesNodeComplete(
  slots: string[],
  slot: string,
  row: AnalysisRow,
  itemPathsInput?: string[] | null,
  categories?: TokenCategory[],
): boolean {
  const itemPaths = resolveItemPaths(slots, itemPathsInput);
  if (isTerminalItemSlot(slot, itemPaths) && !row.question?.trim()) return true;
  if (isPassthroughNode(slots, slot, itemPaths, categories)) {
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

/** @deprecated Node grammars replaced by category grammars — always true per node. */
export function isGrammarNodeComplete(_slots: string[], _slot: string, _row: AnalysisRow): boolean {
  return true;
}

/** @deprecated Answer grammars are generated per turn — always true per node. */
export function isAnswerGrammarNodeComplete(
  _slots: string[],
  _slot: string,
  _row: AnalysisRow,
  _itemPathsInput?: string[] | null,
  _categories?: TokenCategory[],
): boolean {
  return true;
}

/** True when category grammars are complete (recognition lives on categories, not nodes). */
export function isGrammarsNodeComplete(
  _slots: string[],
  _slot: string,
  _row: AnalysisRow,
  _itemPathsInput?: string[] | null,
  categories?: TokenCategory[],
): boolean {
  if (!categories?.length) return false;
  return isCategoryGrammarsLayerReady(categories);
}

/** True when a node has all required NLU fields (messages + grammars). */
export function isNluNodeComplete(
  slots: string[],
  slot: string,
  row: AnalysisRow,
  itemPathsInput?: string[] | null,
  categories?: TokenCategory[],
): boolean {
  return isMessagesNodeComplete(slots, slot, row, itemPathsInput, categories)
    && isGrammarsNodeComplete(slots, slot, row, itemPathsInput, categories);
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
export function isSubtreeMessagesComplete(
  rows: AnalysisRow[],
  rootSlot: string,
  itemPathsInput?: string[] | null,
  categories?: TokenCategory[],
): boolean {
  return isSubtreeLayerComplete(rows, rootSlot, (slots, slot, row) =>
    isMessagesNodeComplete(slots, slot, row, itemPathsInput, categories));
}

/** True when every slot in a subtree has complete grammars. */
export function isSubtreeGrammarsComplete(
  rows: AnalysisRow[],
  rootSlot: string,
  itemPathsInput?: string[] | null,
  categories?: TokenCategory[],
): boolean {
  return isSubtreeLayerComplete(rows, rootSlot, (slots, slot, row) =>
    isGrammarsNodeComplete(slots, slot, row, itemPathsInput, categories));
}

/** True when every slot in a subtree has complete NLU (nothing left to generate). */
export function isSubtreeNluComplete(
  rows: AnalysisRow[],
  rootSlot: string,
  itemPathsInput?: string[] | null,
  categories?: TokenCategory[],
): boolean {
  return isSubtreeLayerComplete(rows, rootSlot, (slots, slot, row) =>
    isNluNodeComplete(slots, slot, row, itemPathsInput, categories));
}

/** True when every attributo category has a valid recognition grammar. */
export function isGrammarsLayerReady(
  _rows: AnalysisRow[],
  _itemPathsInput?: string[] | null,
  categories?: TokenCategory[],
): boolean {
  if (!categories?.length) return false;
  return isCategoryGrammarsLayerReady(categories);
}

/** True when all interactive nodes have messages (ready for grammar pass). */
export function isMessagesLayerReady(
  rows: AnalysisRow[],
  itemPathsInput?: string[] | null,
  startQuestion?: string | null,
  categories?: TokenCategory[],
): boolean {
  const slots = rows.map((r) => r.slot_filling);
  const interactive = slots.filter((s) => requiresInteractiveNode(slots, s, itemPathsInput, categories));
  if (interactive.length === 0) {
    return getAgentGenerationRoots(slots).length > 1 && !!startQuestion?.trim();
  }
  const bySlot = indexRowsBySlot(rows);
  return interactive.every((slot) => {
    const row = getRowBySlot(bySlot, slot);
    return row && isMessagesNodeComplete(slots, slot, row, itemPathsInput, categories);
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
      answer_grammar: saved.answer_grammar ?? null,
      no_match_1: saved.no_match_1,
      no_match_2: saved.no_match_2,
      no_match_3: saved.no_match_3,
      confirmation_text: saved.confirmation_text ?? null,
      status: saved.status ?? null,
    };
  });
}

/**
 * Rebuilds taxonomy for message regeneration: keeps grammars/confirmations,
 * clears questions so new disambiguation copy is always written.
 */
export function mergeTaxonomyForMessageRegen(
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
      grammar: saved.grammar,
      answer_grammar: saved.answer_grammar ?? null,
      confirmation_text: saved.confirmation_text ?? null,
      status: saved.status ?? null,
    };
  });
}

/** Finds the first node where the user must answer (from a root path). */
export function findFirstInteractivePath(
  rows: AnalysisRow[],
  startPath: string,
  itemPathsInput?: string[] | null,
): { path: string; question: string | null } {
  const resolved = resolveNavigationTarget(startPath, rows, itemPathsInput);
  return {
    path: resolved.path,
    question: resolved.isLeaf ? null : resolved.row.question,
  };
}
