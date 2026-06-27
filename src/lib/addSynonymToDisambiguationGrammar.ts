/**
 * Adds a synonym phrase to a disambiguation answer grammar (text mode panels).
 */
import type { GrammarEntry } from './analysisTypes';
import type { DisambiguationQuestionStyle } from './disambiguationPlanTypes';
import {
  buildDisambiguationAnswerGrammarPanels,
  compileDisambiguationAnswerGrammarFromPanels,
} from './disambiguationAnswerGrammarEditor';
import { normalizeSortedSynonymList } from './grammarSynonyms';

function synonymKey(text: string): string {
  return text.trim().toLowerCase();
}

export interface AddSynonymToDisambiguationGrammarResult {
  grammar: GrammarEntry;
  added: boolean;
  error?: string;
}

/** Appends synonym to the panel for targetOption and recompiles answer grammar. */
export function addSynonymToDisambiguationAnswerGrammar(params: {
  options: readonly string[];
  style: DisambiguationQuestionStyle;
  grammar: GrammarEntry | null | undefined;
  targetOption: string;
  synonym: string;
}): AddSynonymToDisambiguationGrammarResult {
  const phrase = params.synonym.trim();
  const target = params.targetOption.trim();
  if (!phrase) {
    return { grammar: params.grammar ?? { regex: '', mappings: {} }, added: false, error: 'Frase vuota.' };
  }
  if (!target) {
    return { grammar: params.grammar ?? { regex: '', mappings: {} }, added: false, error: 'Opzione mancante.' };
  }

  const options = [...params.options];
  const panels = buildDisambiguationAnswerGrammarPanels(options, params.grammar, params.style);
  const panelIndex = panels.findIndex((p) => p.targetPath === target);
  if (panelIndex < 0) {
    return {
      grammar: params.grammar ?? { regex: '', mappings: {} },
      added: false,
      error: `Opzione «${target}» non trovata nella grammatica.`,
    };
  }

  const panel = panels[panelIndex]!;
  const already = panel.synonyms.some((s) => synonymKey(s) === synonymKey(phrase));
  if (already) {
    try {
      const grammar = compileDisambiguationAnswerGrammarFromPanels(panels, options, params.style);
      return { grammar, added: false };
    } catch (e) {
      return {
        grammar: params.grammar ?? { regex: '', mappings: {} },
        added: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  const nextSynonyms = normalizeSortedSynonymList([...panel.synonyms, phrase]);
  const nextPanels = panels.map((p, i) => (
    i === panelIndex ? { ...p, synonyms: nextSynonyms } : p
  ));

  try {
    const grammar = compileDisambiguationAnswerGrammarFromPanels(nextPanels, options, params.style);
    return { grammar, added: true };
  } catch (e) {
    return {
      grammar: params.grammar ?? { regex: '', mappings: {} },
      added: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
