/**
 * Editor state for disambiguation answer grammars (option token → synonyms).
 */
import type { GrammarEntry } from './analysisTypes';
import type { DisambiguationQuestionStyle } from './disambiguationPlanTypes';
import {
  buildCombinatorialAnswerGrammarPanels,
  compileCombinatorialAnswerGrammarFromPanels,
  isCombinatorialAnswerGrammar,
  matchAllCombinatorialAtoms,
  resolveOptionKeyFromMatchedAtoms,
  shouldUseCombinatorialAnswerGrammar,
} from './combinatorialAnswerGrammar';
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

/** True when this message should use atomic combinatorial answer grammar. */
export function usesCombinatorialAnswerGrammar(
  options: string[],
  style: DisambiguationQuestionStyle,
): boolean {
  return shouldUseCombinatorialAnswerGrammar(options, style);
}

/** Builds synonym panels for disambiguation answer grammar (atomic or per-option). */
export function buildDisambiguationAnswerGrammarPanels(
  options: string[],
  grammar: GrammarEntry | null | undefined,
  style: DisambiguationQuestionStyle,
): GrammarEditorPanel[] {
  if (shouldUseCombinatorialAnswerGrammar(options, style)) {
    return buildCombinatorialAnswerGrammarPanels(options, grammar);
  }

  const cleaned = options.map((o) => o.trim()).filter(Boolean);
  const ordered = [...cleaned].sort((a, b) => b.length - a.length);

  return ordered.map((option) => {
    const fromGrammar = grammar?.regex?.trim() && !grammar.combinatorial
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
  options: string[],
  style: DisambiguationQuestionStyle,
): GrammarEntry {
  if (shouldUseCombinatorialAnswerGrammar(options, style)) {
    return compileCombinatorialAnswerGrammarFromPanels(panels);
  }
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
  matchedAtoms?: string[];
}

export interface DisambiguationTestPhraseEvaluation {
  status: DisambiguationTestPhraseStatus;
  recognized: string | null;
  matchedOptions: string[];
  matchedAtoms?: string[];
  compileError: string | null;
}

/** Tests an utterance against the current draft panels (unsaved edits included). */
export function matchDisambiguationAnswerDraft(
  panels: GrammarEditorPanel[],
  utterance: string,
  options: string[],
  style: DisambiguationQuestionStyle,
): DisambiguationAnswerDraftMatch {
  const result = matchAllDisambiguationAnswerDraft(panels, utterance, options, style);
  return {
    selectedOption: result.selectedOption,
    compileError: result.compileError,
  };
}

/**
 * Returns matched catalog option(s) for the utterance.
 * Combinatorial mode: resolves atoms → value-set key; legacy mode: per-option match.
 */
export function matchAllDisambiguationAnswerDraft(
  panels: GrammarEditorPanel[],
  utterance: string,
  options: string[],
  style: DisambiguationQuestionStyle,
): DisambiguationAnswerDraftMatchAll {
  const text = utterance.trim();
  if (!text) {
    return { selectedOption: null, matchedOptions: [], compileError: null };
  }

  try {
    const compiled = compileDisambiguationAnswerGrammarFromPanels(panels, options, style);

    if (isCombinatorialAnswerGrammar(compiled) || shouldUseCombinatorialAnswerGrammar(options, style)) {
      const matchedAtoms = matchAllCombinatorialAtoms(text, compiled);
      const resolved = resolveOptionKeyFromMatchedAtoms(matchedAtoms, options);
      return {
        selectedOption: resolved,
        matchedOptions: resolved ? [resolved] : [],
        matchedAtoms,
        compileError: null,
      };
    }

    const runtime = matchTurnAnswerGrammar(text, compiled);
    const matchedOptions: string[] = [];

    for (const panel of panels) {
      const single = compileDisambiguationAnswerGrammarFromPanels([panel], options, style);
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

/** Evaluates one saved test phrase against an expected catalog option key. */
export function evaluateDisambiguationTestPhrase(
  panels: GrammarEditorPanel[],
  phrase: string,
  expected: string,
  options: string[],
  style: DisambiguationQuestionStyle,
): DisambiguationTestPhraseEvaluation {
  const { matchedOptions, selectedOption, matchedAtoms, compileError } = matchAllDisambiguationAnswerDraft(
    panels,
    phrase,
    options,
    style,
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
      matchedAtoms,
      compileError: null,
    };
  }
  if (matchedOptions.length > 1) {
    return {
      status: 'ambiguous',
      recognized: selectedOption,
      matchedOptions,
      matchedAtoms,
      compileError: null,
    };
  }

  const recognized = matchedOptions[0]!;
  if (recognized === expected) {
    return {
      status: 'ok',
      recognized,
      matchedOptions,
      matchedAtoms,
      compileError: null,
    };
  }

  return {
    status: 'mismatch',
    recognized,
    matchedOptions,
    matchedAtoms,
    compileError: null,
  };
}
