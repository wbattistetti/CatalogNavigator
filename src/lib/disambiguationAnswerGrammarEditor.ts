/**
 * Editor state for disambiguation answer grammars (option token → synonyms).
 */
import type { GrammarEntry } from './analysisTypes';
import type { DisambiguationQuestionStyle } from './disambiguationPlanTypes';
import {
  compileInteractiveGrammar,
  extractSynonymsForTarget,
  sortSynonymsAlphabetically,
  type GrammarEditorPanel,
} from './grammarSynonyms';
import { compileTurnAnswerGrammar, isNoneOption, matchTurnAnswerGrammar } from './turnAnswerGrammar';

function seedSynonymsForOption(option: string, allOptions: string[]): string[] {
  const compiled = compileTurnAnswerGrammar(allOptions);
  if (!compiled) return [option];
  const fromGrammar = extractSynonymsForTarget(compiled, option);
  return fromGrammar.length > 0 ? fromGrammar : [option];
}

/** Builds synonym panels for each disambiguation option token. */
export function buildDisambiguationAnswerGrammarPanels(
  options: string[],
  grammar: GrammarEntry | null | undefined,
  _style: DisambiguationQuestionStyle,
): GrammarEditorPanel[] {
  const cleaned = options.map((o) => o.trim()).filter(Boolean);
  const ordered = [...cleaned].sort((a, b) => b.length - a.length);

  return ordered.map((option) => {
    const fromGrammar = grammar?.regex?.trim()
      ? extractSynonymsForTarget(grammar, option)
      : [];
    const synonyms = fromGrammar.length > 0
      ? fromGrammar
      : seedSynonymsForOption(option, cleaned);

    return {
      targetPath: option,
      label: isNoneOption(option) ? 'none (declino)' : option,
      isParent: false,
      synonyms: sortSynonymsAlphabetically(synonyms),
    };
  });
}

/** Compiles edited panels back to a turn answer grammar. */
export function compileDisambiguationAnswerGrammarFromPanels(
  panels: GrammarEditorPanel[],
): GrammarEntry {
  return compileInteractiveGrammar(panels);
}

export interface DisambiguationAnswerDraftMatch {
  selectedOption: string | null;
  compileError: string | null;
}

/** Tests an utterance against the current draft panels (unsaved edits included). */
export function matchDisambiguationAnswerDraft(
  panels: GrammarEditorPanel[],
  utterance: string,
): DisambiguationAnswerDraftMatch {
  const text = utterance.trim();
  if (!text) {
    return { selectedOption: null, compileError: null };
  }
  try {
    const compiled = compileDisambiguationAnswerGrammarFromPanels(panels);
    const match = matchTurnAnswerGrammar(text, compiled);
    return { selectedOption: match?.selectedOption ?? null, compileError: null };
  } catch (e) {
    return {
      selectedOption: null,
      compileError: e instanceof Error ? e.message : String(e),
    };
  }
}
