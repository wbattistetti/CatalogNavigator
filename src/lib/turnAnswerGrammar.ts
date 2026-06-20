/**
 * Turn-scoped answer grammars for disambiguation and confirmation.
 * Generated at runtime from allowed options — not stored on tree nodes.
 */
import type { GrammarEntry } from './analysisTypes';
import { groupNameFromSlotSegment, normalizeGrammarEntry, validateGrammarRegex, compileGrammarRegex } from './grammarNormalize';
import {
  defaultAffirmativeAnswerSynonyms,
  defaultParentAnswerSynonyms,
  escapeRegexLiteral,
  expandSegmentVariants,
  normalizeSynonymList,
} from './grammarSynonyms';
import { NONE_CANONICAL } from './categoryGrammar';

export { NONE_CANONICAL };

/** Runtime/catalog sentinel for "path without this category segment". */
export function isNoneOption(option: string): boolean {
  return option === NONE_CANONICAL || option.trim().toLowerCase() === 'none';
}

function optionGroupName(option: string, usedNames: Set<string>): string {
  if (isNoneOption(option)) return 'none';
  let base = groupNameFromSlotSegment(option) || 'opzione';
  let groupName = base;
  let suffix = 0;
  while (usedNames.has(groupName)) {
    groupName = `${base}_${suffix}`;
    suffix += 1;
  }
  usedNames.add(groupName);
  return groupName;
}

function synonymsForTurnOption(option: string, optionCount: number): string[] {
  if (isNoneOption(option)) {
    return normalizeSynonymList([
      ...defaultParentAnswerSynonyms(),
      'no',
      'niente',
      'neanche',
      'nessuno',
      'nessuna',
      'nessun esame',
      'senza esame',
    ]);
  }

  const base = normalizeSynonymList([option, ...expandSegmentVariants(option)]);
  if (optionCount === 2) {
    return normalizeSynonymList([...base, ...defaultAffirmativeAnswerSynonyms()]);
  }
  return base;
}

/**
 * Compiles a grammar that maps user answers to disambiguation options.
 * Each option becomes one named group; NONE uses negative/decline synonyms.
 */
export function compileTurnAnswerGrammar(options: string[]): GrammarEntry | null {
  const cleaned = options.filter((o) => o?.trim());
  if (cleaned.length === 0) return null;

  const parts: string[] = [];
  const mappings: Record<string, string> = {};
  const usedNames = new Set<string>();

  const ordered = [...cleaned].sort((a, b) => b.length - a.length);

  for (const option of ordered) {
    const synonyms = synonymsForTurnOption(option, cleaned.length);
    if (synonyms.length === 0) continue;

    const groupName = optionGroupName(option, usedNames);
    parts.push(`(?<${groupName}>${synonyms.map(escapeRegexLiteral).join('|')})`);
    mappings[groupName] = option;
  }

  if (parts.length === 0) return null;

  const entry = normalizeGrammarEntry({ regex: parts.join('|'), mappings });
  const validation = validateGrammarRegex(entry.regex, entry.mappings);
  if (!validation.valid) {
    throw new Error(validation.error ?? 'Grammatica risposta turno non valida');
  }
  return entry;
}

export interface TurnAnswerMatch {
  selectedOption: string;
}

/** Matches utterance against a turn answer grammar; returns selected option value. */
export function matchTurnAnswerGrammar(
  text: string,
  grammar: GrammarEntry,
): TurnAnswerMatch | null {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed || !grammar.regex?.trim()) return null;

  const entry = normalizeGrammarEntry(grammar);
  let re: RegExp;
  try {
    re = compileGrammarRegex(entry.regex);
  } catch {
    return null;
  }

  const match = re.exec(trimmed);
  if (!match?.groups) return null;

  let bestOption: string | null = null;
  let bestLength = -1;
  for (const [groupName, rawValue] of Object.entries(match.groups)) {
    if (rawValue == null || rawValue === '') continue;
    const mapped = entry.mappings[groupName]?.trim();
    if (!mapped) continue;
    if (rawValue.length > bestLength) {
      bestLength = rawValue.length;
      bestOption = mapped;
    }
  }

  if (!bestOption) return null;
  return { selectedOption: bestOption };
}
