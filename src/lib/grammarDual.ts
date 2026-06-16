/**
 * Dual-grammar helpers: node recognition (maps to self) vs answer routing (maps to children).
 */
import type { AnalysisRow, GrammarEntry } from '../hooks/useAnalysis';
import type { TokenCategory } from './dictionaryTree';
import { requiresInteractiveNode } from './nluQuestionRules';
import {
  compileSimpleGrammar,
  defaultSynonymsForSlot,
  extractSimpleSynonyms,
} from './grammarSynonyms';

/** True when every mapping points only to the node's own path. */
export function grammarMapsToSelf(grammar: GrammarEntry, slot: string): boolean {
  const paths = new Set(Object.values(grammar.mappings).map((p) => p.trim()));
  return paths.size === 1 && paths.has(slot);
}

/** True when at least one mapping targets a strict descendant path. */
export function grammarMapsToChildren(grammar: GrammarEntry, slot: string): boolean {
  return Object.values(grammar.mappings).some((p) => {
    const path = p.trim();
    return path !== slot && path.startsWith(`${slot}.`);
  });
}

/**
 * Migrates legacy single-grammar rows into node + answer_grammar split.
 * Interactive nodes with child mappings in `grammar` move that to `answer_grammar`
 * and rebuild node grammar as simple self-mapping.
 */
export function migrateDualGrammars(
  rows: AnalysisRow[],
  itemPaths: string[],
  categories?: TokenCategory[],
): AnalysisRow[] {
  const slots = rows.map((r) => r.slot_filling);

  return rows.map((row) => {
    const slot = row.slot_filling;
    let grammar = row.grammar;
    let answer_grammar = row.answer_grammar ?? null;

    if (!requiresInteractiveNode(slots, slot, itemPaths, categories)) {
      return { ...row, answer_grammar: null };
    }

    if (answer_grammar?.regex?.trim()) {
      if (!grammar?.regex?.trim() || !grammarMapsToSelf(grammar, slot)) {
        const synonyms = grammar?.regex?.trim()
          ? extractSimpleSynonyms(grammar, slot)
          : defaultSynonymsForSlot(slot);
        grammar = compileSimpleGrammar(slot, synonyms);
      }
      return { ...row, grammar, answer_grammar };
    }

    if (grammar?.regex?.trim() && grammarMapsToChildren(grammar, slot)) {
      answer_grammar = grammar;
      grammar = compileSimpleGrammar(slot, defaultSynonymsForSlot(slot));
      return { ...row, grammar, answer_grammar };
    }

    return { ...row, grammar, answer_grammar };
  });
}
