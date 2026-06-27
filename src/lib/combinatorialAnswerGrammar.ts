/**
 * Combinatorial disambiguation answer grammars: one panel per atomic value,
 * independent matching, engine resolves catalog value-set keys from matched atoms.
 */
import type { GrammarEntry } from './analysisTypes';
import type { DisambiguationQuestionStyle } from './disambiguationPlanTypes';
import {
  compileGrammarRegex,
  groupNameFromSlotSegment,
  normalizeGrammarEntry,
  validateGrammarRegex,
} from './grammarNormalize';
import {
  escapeRegexLiteral,
  expandSegmentVariants,
  normalizeSynonymList,
  sortSynonymsAlphabetically,
  type GrammarEditorPanel,
} from './grammarSynonyms';
import { isNoneOption } from './turnAnswerGrammar';
import {
  normalizeValueList,
  parseValueSetKey,
  VALUE_SET_SEPARATOR,
  valueSetContainsAll,
  valueSetKey,
} from './valueSet';

/** Extracts the pattern body of a named capture group from a regex string. */
export function extractNamedGroupPattern(regex: string, groupName: string): string | null {
  const marker = `(?<${groupName}>`;
  const idx = regex.indexOf(marker);
  if (idx < 0) return null;

  let depth = 1;
  let i = idx + marker.length;
  const start = i;
  while (i < regex.length && depth > 0) {
    const ch = regex[i]!;
    if (ch === '(' && regex[i - 1] !== '\\') depth += 1;
    else if (ch === ')' && regex[i - 1] !== '\\') depth -= 1;
    i += 1;
  }
  if (depth !== 0) return null;
  return regex.slice(start, i - 1);
}

/** True when disambiguation options need atomic combinatorial answer grammar. */
export function shouldUseCombinatorialAnswerGrammar(
  options: readonly string[],
  style?: DisambiguationQuestionStyle,
): boolean {
  if (style === 'optional_include' || style === 'ask_age') return false;

  const cleaned = options
    .map((o) => o.trim())
    .filter(Boolean)
    .filter((o) => !isNoneOption(o));
  if (cleaned.length === 0) return false;

  const hasCombined = cleaned.some((o) => o.includes(VALUE_SET_SEPARATOR));
  if (!hasCombined) return false;

  return extractAtomicTokensFromOptions(cleaned).length >= 2;
}

/** Distinct atomic tokens from all option value-set keys (longest first). */
export function extractAtomicTokensFromOptions(options: readonly string[]): string[] {
  const seen = new Set<string>();
  const atoms: string[] = [];

  for (const optionKey of options) {
    if (isNoneOption(optionKey)) continue;
    for (const token of parseValueSetKey(optionKey)) {
      const key = token.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      atoms.push(token);
    }
  }

  return atoms.sort((a, b) => {
    const byLen = b.length - a.length;
    if (byLen !== 0) return byLen;
    return a.localeCompare(b, 'it');
  });
}

function atomGroupName(atom: string, usedNames: Set<string>): string {
  let base = groupNameFromSlotSegment(atom) || 'atom';
  let groupName = base;
  let suffix = 0;
  while (usedNames.has(groupName)) {
    groupName = `${base}_${suffix}`;
    suffix += 1;
  }
  usedNames.add(groupName);
  return groupName;
}

function defaultSynonymsForAtom(atom: string): string[] {
  return sortSynonymsAlphabetically(
    normalizeSynonymList([atom, ...expandSegmentVariants(atom)]),
  );
}

/** Builds synonym panels for atomic tokens (combinatorial mode). */
export function buildCombinatorialAnswerGrammarPanels(
  options: readonly string[],
  grammar: GrammarEntry | null | undefined,
): GrammarEditorPanel[] {
  const atoms = extractAtomicTokensFromOptions(options);
  const entry = grammar?.combinatorial ? normalizeGrammarEntry(grammar) : null;

  return atoms.map((atom) => {
    let synonyms = defaultSynonymsForAtom(atom);
    if (entry?.regex?.trim()) {
      const groupName = Object.entries(entry.mappings).find(([, v]) => v === atom)?.[0];
      if (groupName) {
        const pattern = extractNamedGroupPattern(entry.regex, groupName);
        if (pattern) {
          const fromPattern = pattern
            .split('|')
            .map((s) => s.replace(/\\(.)/g, '$1').trim())
            .filter(Boolean);
          if (fromPattern.length > 0) {
            synonyms = sortSynonymsAlphabetically(normalizeSynonymList(fromPattern));
          }
        }
      }
    }

    return {
      targetPath: atom,
      label: atom,
      isParent: false,
      synonyms,
    };
  });
}

/** Compiles a combinatorial answer grammar from atomic synonym panels. */
export function compileCombinatorialAnswerGrammarFromPanels(
  panels: GrammarEditorPanel[],
): GrammarEntry {
  const parts: string[] = [];
  const mappings: Record<string, string> = {};
  const usedNames = new Set<string>();

  for (const panel of panels) {
    const cleaned = normalizeSynonymList(panel.synonyms);
    if (cleaned.length === 0) continue;

    const groupName = atomGroupName(panel.targetPath, usedNames);
    parts.push(`(?<${groupName}>${cleaned.map(escapeRegexLiteral).join('|')})`);
    mappings[groupName] = panel.targetPath;
  }

  if (parts.length === 0) {
    throw new Error('Inserisci almeno un sinonimo in un pannello atomico');
  }

  const entry = normalizeGrammarEntry({
    regex: parts.join('|'),
    mappings,
    combinatorial: true,
  });
  const validation = validateGrammarRegex(entry.regex, entry.mappings);
  if (!validation.valid) {
    throw new Error(validation.error ?? 'Grammatica combinatoria non valida');
  }
  return entry;
}

/** Auto-generates combinatorial answer grammar from catalog option keys. */
export function compileCombinatorialAnswerGrammar(options: readonly string[]): GrammarEntry | null {
  if (!shouldUseCombinatorialAnswerGrammar(options)) return null;
  try {
    const panels = buildCombinatorialAnswerGrammarPanels(options, null);
    return compileCombinatorialAnswerGrammarFromPanels(panels);
  } catch {
    return null;
  }
}

/** Matches every atomic value mentioned independently in the utterance. */
export function matchAllCombinatorialAtoms(text: string, grammar: GrammarEntry): string[] {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed || !grammar.regex?.trim()) return [];

  const entry = normalizeGrammarEntry(grammar);
  const matched: string[] = [];

  for (const [groupName, atom] of Object.entries(entry.mappings)) {
    const pattern = extractNamedGroupPattern(entry.regex, groupName);
    if (!pattern) continue;
    try {
      const re = compileGrammarRegex(`(?<${groupName}>${pattern})`);
      if (!re.test(trimmed)) continue;
      if (!matched.some((m) => m.toLowerCase() === atom.toLowerCase())) {
        matched.push(atom);
      }
    } catch {
      continue;
    }
  }

  return normalizeValueList(matched);
}

/**
 * Resolves a catalog option key from mentioned atomic values.
 * Exact match first, then maximal compatible combination (product rule).
 */
export function resolveOptionKeyFromMatchedAtoms(
  mentioned: readonly string[],
  options: readonly string[],
): string | null {
  const normalized = normalizeValueList(mentioned);
  if (normalized.length === 0) return null;

  const cleaned = options.map((o) => o.trim()).filter(Boolean);
  const mentionedKey = valueSetKey(normalized);
  const exact = cleaned.find((o) => o.toLowerCase() === mentionedKey.toLowerCase());
  if (exact) return exact;

  let bestKey: string | null = null;
  let bestCount = -1;

  for (const optionKey of cleaned) {
    if (isNoneOption(optionKey)) continue;
    const optionValues = parseValueSetKey(optionKey);
    if (!valueSetContainsAll(optionValues, normalized)) continue;
    if (optionValues.length > bestCount) {
      bestCount = optionValues.length;
      bestKey = optionKey;
    }
  }

  return bestKey;
}

export function isCombinatorialAnswerGrammar(
  grammar: GrammarEntry | null | undefined,
): boolean {
  return grammar?.combinatorial === true;
}
