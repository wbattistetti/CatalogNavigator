/**
 * Deterministic message row assembly: compiler owns the full tree;
 * AI contributes only disambiguation questions for interactive paths.
 */
import type { AnalysisRow } from '../hooks/useAnalysis';
import { getDirectChildSlots } from './analysisTree';
import {
  buildPrefixDisambiguationQuestion,
  getDescendantItemSlots,
  getDirectChildItemSlots,
  isPrefixAmbiguityNode,
  resolveItemPaths,
} from './itemPaths';
import { isPassthroughNode, requiresInteractiveNode } from './nluQuestionRules';

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

/** Empty row for passthrough nodes and terminal items (no AI involvement). */
export function buildMessageFreeRow(slot: string): AnalysisRow {
  return {
    slot_filling: slot,
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

/** Default re-prompts when AI omits no_match fields. */
export function defaultNoMatchReplies(question: string | null): {
  no_match_1: string;
  no_match_2: string;
  no_match_3: string;
} {
  const hint = question?.trim().replace(/\?+\s*$/, '').trim();
  const suffix = hint ? ` ${hint}?` : '';
  return {
    no_match_1: `Non ho capito.${suffix || ' Può ripetere?'}`,
    no_match_2: `Mi scusi, non ho capito bene. Può ripetere?${suffix}`,
    no_match_3: 'Non riesco a capire. Può formulare la risposta in altro modo?',
  };
}

/** Algorithmic disambiguation question + re-prompts for one interactive path. */
export function buildInteractiveMessageFallback(
  slots: string[],
  slot: string,
  itemPathsInput?: string[] | null,
): Pick<AnalysisRow, 'question' | 'no_match_1' | 'no_match_2' | 'no_match_3'> {
  const itemPaths = resolveItemPaths(slots, itemPathsInput);
  let question: string | null = null;

  if (isPrefixAmbiguityNode(slots, slot, itemPaths)) {
    const directChildItems = getDirectChildItemSlots(slot, itemPaths);
    const targets = directChildItems.length > 0
      ? directChildItems
      : getDescendantItemSlots(slot, itemPaths);
    question = buildPrefixDisambiguationQuestion(slot, targets);
  } else {
    const children = getDirectChildSlots(slots, slot);
    if (children.length >= 2 && children.length <= 3) {
      question = `Quale ${lastSegment(slot)} desidera: ${formatOptionsList(children)}?`;
    } else if (children.length >= 4) {
      question = `Quale ${lastSegment(slot)} desidera?`;
    }
  }

  const noMatch = defaultNoMatchReplies(question);
  return { question, ...noMatch };
}

/** Fills missing no_match fields on interactive rows that already have a question. */
export function ensureInteractiveNoMatch(row: AnalysisRow): AnalysisRow {
  if (!row.question?.trim()) return row;
  const noMatch = defaultNoMatchReplies(row.question);
  return {
    ...row,
    no_match_1: row.no_match_1?.trim() || noMatch.no_match_1,
    no_match_2: row.no_match_2?.trim() || noMatch.no_match_2,
    no_match_3: row.no_match_3?.trim() || noMatch.no_match_3,
  };
}

/** True when the slot does not need an AI disambiguation question. */
export function isMessageFreeSlot(
  slots: string[],
  slot: string,
  itemPathsInput?: string[] | null,
): boolean {
  const itemPaths = resolveItemPaths(slots, itemPathsInput);
  return isPassthroughNode(slots, slot, itemPaths)
    || !requiresInteractiveNode(slots, slot, itemPaths);
}
