/**
 * Resolution grammars for vincolo categories: extract user values (not catalog tokens).
 */
import type { GrammarEntry } from './analysisTypes';
import { normalizeGrammarEntry, validateGrammarRegex } from './grammarNormalize';
import type { TokenCategory } from './dictionaryTree';

/** True when the category name denotes an age-band constraint. */
export function isAgeVincoloCategoryName(name: string): boolean {
  const n = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s*\(vincolo\)\s*/gi, '');
  return n.includes('fascia') && n.includes('et');
}

/**
 * Detection grammar for patient age in Italian utterances.
 * On match, runtime normalizes the captured text to integer years (see VB ConceptExtraction).
 */
export function compileAgeYearsResolutionGrammar(): GrammarEntry {
  const patterns = [
    String.raw`(?:ho|ha|sono|è|e|di)\s*\d{1,3}\s*anni?`,
    String.raw`\b\d{1,3}\s*anni?\b`,
    String.raw`(?:ho|ha|sono|è|e|di)\s+(?:zero|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|undici|dodici|tredici|quattordici|quindici|sedici|diciassette|diciotto|diciannove|venti|trenta|quaranta|cinquanta|sessanta|settanta|ottanta|novanta|cento)(?:\s+anni|\s*'anni)?`,
    String.raw`\b(?:zero|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|undici|dodici|tredici|quattordici|quindici|sedici|diciassette|diciotto|diciannove|venti|trenta|quaranta|cinquanta|sessanta|settanta|ottanta|novanta|cento)(?:\s+anni|\s*'anni)\b`,
    String.raw`\b(?:venti|trenta|quaranta|cinquanta|sedici|diciassette|diciotto|diciannove)(?:'|\s+)anni\b`,
    String.raw`^\d{1,3}$`,
  ];

  const entry = normalizeGrammarEntry({
    regex: patterns.join('|'),
    mappings: { age_detect: '1' },
  });

  const validation = validateGrammarRegex(entry.regex, entry.mappings);
  if (!validation.valid) {
    throw new Error(validation.error ?? 'Grammatica risoluzione età non valida');
  }

  return entry;
}

/** Builds resolution grammar for a vincolo category (age years today; extensible later). */
export function compileVincoloResolutionGrammar(category: TokenCategory): GrammarEntry | null {
  if (category.type !== 'vincolo') return null;
  if (!isAgeVincoloCategoryName(category.name)) return null;
  return compileAgeYearsResolutionGrammar();
}
