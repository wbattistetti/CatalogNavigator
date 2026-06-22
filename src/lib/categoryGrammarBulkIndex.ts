/**
 * Precompiled category grammars for bulk corpus segmentation (avoids per-row regex rebuild).
 */
import type { AnalysisRow } from '../hooks/useAnalysis';
import type { GrammarEntry } from './analysisTypes';
import { compileGrammarRegex, normalizeGrammarEntry, validateGrammarRegex } from './grammarNormalize';
import type { TokenCategory } from './dictionaryTree';
import {
  compileCategoryGrammar,
  isCategoryGrammarComplete,
  synonymsForCanonicalValue,
} from './categoryGrammar';
import { escapeRegexLiteral } from './grammarSynonyms';
import { matchGrammarInput } from './grammarMatch';
import { stripAttachedPlusPrefix } from './phraseMatchEngine';
import { isCanonicalToken, tokenizeToWords, type TokenEntry } from './tokenDictionary';

const EMPTY_ROW_FIELDS = {
  answer_grammar: null,
  question: null,
  no_match_1: null,
  no_match_2: null,
  no_match_3: null,
  confirmation_text: null,
  status: null,
} as const;

interface CanonicalGrammarProbe {
  canonical: string;
  tokenRow: AnalysisRow | null;
  synonymRow: AnalysisRow | null;
}

export interface CategoryGrammarBulkMatcher {
  categoryId: string;
  categoryType: TokenCategory['type'];
  /** Compiled category grammar — one global scan for all values. */
  globalGrammar: GrammarEntry | null;
  globalRegex: RegExp | null;
  canonicalProbes: Map<string, CanonicalGrammarProbe>;
  wordToCanonicals: Map<string, Set<string>>;
  canonicals: string[];
}

export interface CategoryGrammarBulkIndex {
  categories: CategoryGrammarBulkMatcher[];
}

function analysisRow(slot: string, grammar: GrammarEntry): AnalysisRow {
  return { slot_filling: slot, grammar, ...EMPTY_ROW_FIELDS };
}

function buildSynonymRow(canonical: string, tokens: TokenEntry[]): AnalysisRow | null {
  const synonyms = synonymsForCanonicalValue(canonical, tokens);
  if (synonyms.length === 0) return null;

  const groupName = 'valore';
  const regex = `(?<${groupName}>${synonyms.map(escapeRegexLiteral).join('|')})`;
  const grammar = normalizeGrammarEntry({ regex, mappings: { [groupName]: canonical } });
  const validation = validateGrammarRegex(grammar.regex, grammar.mappings);
  if (!validation.valid) return null;
  return analysisRow(canonical, grammar);
}

function addWordsToIndex(
  index: Map<string, Set<string>>,
  canonical: string,
  synonyms: string[],
): void {
  for (const synonym of synonyms) {
    for (const word of tokenizeToWords(synonym.toLowerCase())) {
      const keys = [word, stripAttachedPlusPrefix(word)];
      for (const key of keys) {
        const bucket = index.get(key);
        if (bucket) bucket.add(canonical);
        else index.set(key, new Set([canonical]));
      }
    }
  }
}

function buildCategoryMatcher(
  category: TokenCategory,
  tokens: TokenEntry[],
): CategoryGrammarBulkMatcher {
  const canonicals = [...new Set(category.tokenTexts ?? [])];
  const wordToCanonicals = new Map<string, Set<string>>();
  const canonicalProbes = new Map<string, CanonicalGrammarProbe>();
  const tokenByText = new Map(
    tokens.filter(isCanonicalToken).map((t) => [t.text, t]),
  );

  let globalGrammar: GrammarEntry | null = null;
  let globalRegex: RegExp | null = null;

  if (isCategoryGrammarComplete(category) && category.grammar?.regex?.trim()) {
    globalGrammar = normalizeGrammarEntry(category.grammar);
    try {
      const base = compileGrammarRegex(globalGrammar.regex);
      const flags = base.flags.includes('g') ? base.flags : `${base.flags}g`;
      globalRegex = new RegExp(base.source, flags);
    } catch {
      globalGrammar = null;
      globalRegex = null;
    }
  } else if (category.type !== 'vincolo' && canonicals.length > 0) {
    try {
      globalGrammar = compileCategoryGrammar(category, tokens);
      if (globalGrammar?.regex?.trim()) {
        const base = compileGrammarRegex(globalGrammar.regex);
        const flags = base.flags.includes('g') ? base.flags : `${base.flags}g`;
        globalRegex = new RegExp(base.source, flags);
      }
    } catch {
      globalGrammar = null;
      globalRegex = null;
    }
  }

  for (const canonical of canonicals) {
    const entry = tokenByText.get(canonical);
    let tokenRow: AnalysisRow | null = null;
    if (entry?.grammar?.regex?.trim()) {
      tokenRow = analysisRow(canonical, entry.grammar);
    }

    const synonyms = synonymsForCanonicalValue(canonical, tokens);
    addWordsToIndex(wordToCanonicals, canonical, synonyms);

    let synonymRow: AnalysisRow | null = null;
    if (!globalRegex && !tokenRow) {
      synonymRow = buildSynonymRow(canonical, tokens);
    }

    canonicalProbes.set(canonical, { canonical, tokenRow, synonymRow });
  }

  return {
    categoryId: category.id,
    categoryType: category.type,
    globalGrammar,
    globalRegex,
    canonicalProbes,
    wordToCanonicals,
    canonicals,
  };
}

/** Precompiles category grammars and synonym word index once per corpus build. */
export function buildCategoryGrammarBulkIndex(
  categories: TokenCategory[],
  tokens: TokenEntry[],
): CategoryGrammarBulkIndex {
  const categoriesMatchers = categories
    .filter((c) => c.type !== 'vincolo')
    .map((category) => buildCategoryMatcher(category, tokens));

  return { categories: categoriesMatchers };
}

function matchFromGlobalGrammar(text: string, matcher: CategoryGrammarBulkMatcher): string[] {
  if (!matcher.globalRegex || !matcher.globalGrammar) return [];

  const found = new Set<string>();
  const trimmed = text.trim();
  const regex = matcher.globalRegex;
  regex.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(trimmed)) !== null) {
    if (match.groups) {
      for (const [groupName, raw] of Object.entries(match.groups)) {
        if (!raw) continue;
        const mapped = matcher.globalGrammar.mappings[groupName]?.trim();
        if (mapped) found.add(mapped);
      }
    }
    if (match[0].length === 0) regex.lastIndex += 1;
  }

  return [...found];
}

function candidateCanonicalsForText(
  text: string,
  matcher: CategoryGrammarBulkMatcher,
): Set<string> {
  const candidates = new Set<string>();
  const words = tokenizeToWords(text.trim().toLowerCase());
  for (const word of words) {
    const keys = [word, stripAttachedPlusPrefix(word)];
    for (const key of keys) {
      const bucket = matcher.wordToCanonicals.get(key);
      if (!bucket) continue;
      for (const canonical of bucket) candidates.add(canonical);
    }
  }
  return candidates;
}

function probeCanonical(text: string, probe: CanonicalGrammarProbe): boolean {
  const trimmed = text.trim().toLowerCase();
  if (probe.tokenRow) {
    const tokenMatch = matchGrammarInput(trimmed, probe.tokenRow);
    if (tokenMatch.targetPath) return true;
  }
  if (probe.synonymRow) {
    const synonymMatch = matchGrammarInput(trimmed, probe.synonymRow);
    if (synonymMatch.targetPath === probe.canonical) return true;
  }
  return false;
}

/** Fast category value scan using precompiled grammars and word index. */
export function matchAllCategoryGrammarValuesBulk(
  text: string,
  matcher: CategoryGrammarBulkMatcher,
  onlyCanonicals?: Set<string>,
): string[] {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return [];

  const values: string[] = [];
  const seen = new Set<string>();

  const accept = (canonical: string) => {
    if (onlyCanonicals && !onlyCanonicals.has(canonical)) return;
    if (seen.has(canonical)) return;
    seen.add(canonical);
    values.push(canonical);
  };

  for (const canonical of matchFromGlobalGrammar(trimmed, matcher)) {
    accept(canonical);
  }

  if (onlyCanonicals) {
    for (const canonical of onlyCanonicals) {
      if (seen.has(canonical)) continue;
      const probe = matcher.canonicalProbes.get(canonical);
      if (probe?.tokenRow && probeCanonical(trimmed, probe)) accept(canonical);
    }
  }

  const candidates = onlyCanonicals
    ? [...onlyCanonicals].filter((c) => matcher.canonicalProbes.has(c))
    : (candidateCanonicalsForText(trimmed, matcher).size > 0
      ? [...candidateCanonicalsForText(trimmed, matcher)]
      : matcher.canonicals);

  for (const canonical of candidates) {
    if (seen.has(canonical)) continue;
    const probe = matcher.canonicalProbes.get(canonical);
    if (!probe) continue;
    if (probe.tokenRow && probeCanonical(trimmed, probe)) {
      accept(canonical);
      continue;
    }
    if (!matcher.globalRegex && probe.synonymRow && probeCanonical(trimmed, probe)) {
      accept(canonical);
    }
  }

  return values;
}
