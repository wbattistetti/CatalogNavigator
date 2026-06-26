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

export type DisambiguationTestPhraseStatus =
  | 'ok'
  | 'ambiguous'
  | 'no_match'
  | 'mismatch'
  | 'error';

export interface DisambiguationAnswerDraftMatchAll extends DisambiguationAnswerDraftMatch {
  matchedOptions: string[];
}

export interface DisambiguationTestPhraseEvaluation {
  status: DisambiguationTestPhraseStatus;
  recognized: string | null;
  matchedOptions: string[];
  compileError: string | null;
}

/** Tests an utterance against the current draft panels (unsaved edits included). */
export function matchDisambiguationAnswerDraft(
  panels: GrammarEditorPanel[],
  utterance: string,
): DisambiguationAnswerDraftMatch {
  const result = matchAllDisambiguationAnswerDraft(panels, utterance);
  return {
    selectedOption: result.selectedOption,
    compileError: result.compileError,
  };
}

/**
 * Returns every option whose draft panel matches the utterance independently.
 * Ambiguity = more than one option matches.
 */
export function matchAllDisambiguationAnswerDraft(
  panels: GrammarEditorPanel[],
  utterance: string,
): DisambiguationAnswerDraftMatchAll {
  const text = utterance.trim();
  if (!text) {
    return { selectedOption: null, matchedOptions: [], compileError: null };
  }

  try {
    const compiled = compileDisambiguationAnswerGrammarFromPanels(panels);
    const runtime = matchTurnAnswerGrammar(text, compiled);
    const matchedOptions: string[] = [];

    for (const panel of panels) {
      const single = compileDisambiguationAnswerGrammarFromPanels([panel]);
      const match = matchTurnAnswerGrammar(text, single);
      if (match?.selectedOption && !matchedOptions.includes(match.selectedOption)) {
        matchedOptions.push(match.selectedOption);
      }
    }

    return {
      selectedOption: runtime?.selectedOption ?? null,
      matchedOptions,
      compileError: null,
    };
  } catch (e) {
    return {
      selectedOption: null,
      matchedOptions: [],
      compileError: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Evaluates one saved test phrase against an expected option token. */
export function evaluateDisambiguationTestPhrase(
  panels: GrammarEditorPanel[],
  phrase: string,
  expected: string,
): DisambiguationTestPhraseEvaluation {
  const { matchedOptions, selectedOption, compileError } = matchAllDisambiguationAnswerDraft(
    panels,
    phrase,
  );
  if (compileError) {
    return {
      status: 'error',
      recognized: null,
      matchedOptions: [],
      compileError,
    };
  }
  if (matchedOptions.length === 0) {
    return {
      status: 'no_match',
      recognized: null,
      matchedOptions: [],
      compileError: null,
    };
  }
  if (matchedOptions.length > 1) {
    return {
      status: 'ambiguous',
      recognized: selectedOption,
      matchedOptions,
      compileError: null,
    };
  }

  const recognized = matchedOptions[0]!;
  if (recognized === expected) {
    return {
      status: 'ok',
      recognized,
      matchedOptions,
      compileError: null,
    };
  }

  return {
    status: 'mismatch',
    recognized,
    matchedOptions,
    compileError: null,
  };
}
