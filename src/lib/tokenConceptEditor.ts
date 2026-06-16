/**
 * Parse and apply canonical token lines with optional aliases (editor syntax: "canonico: syn1, syn2").
 * Persists as flat TokenEntry[] with aliasOf — no schema change.
 */
import {
  addTokenToCategorySorted,
  moveTokensToRoot,
  NO_CATEGORY_SENTINEL,
  type TokenCategory,
} from './dictionaryTree';
import {
  addAlias,
  addToken,
  isCanonicalToken,
  normalizeDescriptionText,
  removeAlias,
  selectionToTokenPhrase,
  type TokenEntry,
} from './tokenDictionary';

export interface ParsedConceptLine {
  canonical: string;
  aliases: string[];
}

/** Normalizes one alias phrase from a comma-separated segment. */
function normalizeAliasPhrase(raw: string): string {
  const phrase = selectionToTokenPhrase(raw.trim());
  return phrase || normalizeDescriptionText(raw);
}

/**
 * Parses editor text: "prima", "prima:", or "prima: visita specialistica, prima visita".
 * Left of the first colon is canonical; right side is comma-separated aliases.
 */
export function parseConceptEditorLine(raw: string): ParsedConceptLine {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Testo concetto vuoto');

  const colonIdx = trimmed.indexOf(':');
  if (colonIdx === -1) {
    const canonical = normalizeAliasPhrase(trimmed);
    if (!canonical) throw new Error('Token canonico non valido');
    return { canonical, aliases: [] };
  }

  const canonical = normalizeAliasPhrase(trimmed.slice(0, colonIdx));
  if (!canonical) throw new Error('Token canonico non valido');

  const right = trimmed.slice(colonIdx + 1).trim();
  if (!right) return { canonical, aliases: [] };

  const seen = new Set<string>();
  const aliases: string[] = [];
  for (const part of right.split(',')) {
    const alias = normalizeAliasPhrase(part);
    if (!alias || alias === canonical) continue;
    if (seen.has(alias)) continue;
    seen.add(alias);
    aliases.push(alias);
  }

  return { canonical, aliases };
}

/** Lists alias surface phrases linked to one canonical token. */
export function listAliasesForCanonical(tokens: TokenEntry[], canonical: string): string[] {
  return tokens
    .filter((t) => t.aliasOf === canonical)
    .map((t) => t.text)
    .sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));
}

/** Builds the editor line for one canonical token and its aliases. */
export function formatConceptEditorLine(canonical: string, aliases: string[]): string {
  const sorted = [...aliases].sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));
  if (sorted.length === 0) return canonical;
  return `${canonical}: ${sorted.join(', ')}`;
}

function renameCanonicalInTokens(
  tokens: TokenEntry[],
  oldCanonical: string,
  newCanonical: string,
): TokenEntry[] {
  if (oldCanonical === newCanonical) return tokens;
  return tokens.map((t) => {
    if (t.text === oldCanonical && isCanonicalToken(t)) {
      return { ...t, text: newCanonical };
    }
    if (t.aliasOf === oldCanonical) {
      return { ...t, aliasOf: newCanonical };
    }
    return t;
  });
}

function renameCanonicalInCategories(
  categories: TokenCategory[],
  oldCanonical: string,
  newCanonical: string,
): TokenCategory[] {
  if (oldCanonical === newCanonical) return categories;
  return categories.map((cat) => ({
    ...cat,
    tokenTexts: cat.tokenTexts.map((t) => (t === oldCanonical ? newCanonical : t)),
  }));
}

function syncAliasesForCanonical(
  tokens: TokenEntry[],
  canonical: string,
  desiredAliases: string[],
): TokenEntry[] {
  let next = tokens;
  const existing = new Set(listAliasesForCanonical(next, canonical));
  const desiredSet = new Set(desiredAliases);

  for (const alias of existing) {
    if (!desiredSet.has(alias)) {
      next = removeAlias(next, alias);
    }
  }

  for (const alias of desiredAliases) {
    if (existing.has(alias)) continue;
    if (next.some((t) => t.text === alias && isCanonicalToken(t))) {
      throw new Error(`"${alias}" è già un token canonico`);
    }
    next = addAlias(next, alias, canonical);
  }

  return next;
}

/**
 * Applies an editor line to one canonical concept: rename, add/remove aliases.
 * Returns updated tokens and categories (canonical rename updates category tokenTexts).
 */
export function applyCanonicalConceptEdit(
  tokens: TokenEntry[],
  categories: TokenCategory[],
  oldCanonical: string,
  editorLine: string,
): { tokens: TokenEntry[]; categories: TokenCategory[]; canonical: string } {
  const { canonical: newCanonical, aliases: desiredAliases } = parseConceptEditorLine(editorLine);

  const canonicalEntry = tokens.find((t) => t.text === oldCanonical && isCanonicalToken(t));
  if (!canonicalEntry) throw new Error(`Token canonico non trovato: ${oldCanonical}`);

  let nextTokens = renameCanonicalInTokens(tokens, oldCanonical, newCanonical);
  let nextCategories = renameCanonicalInCategories(categories, oldCanonical, newCanonical);
  nextTokens = syncAliasesForCanonical(nextTokens, newCanonical, desiredAliases);

  return { tokens: nextTokens, categories: nextCategories, canonical: newCanonical };
}

/**
 * Adds a new canonical (and optional aliases) from the editor / "Nuovo token" field.
 */
export function applyNewConceptLine(
  tokens: TokenEntry[],
  categories: TokenCategory[],
  activeCategoryKey: string,
  editorLine: string,
): { tokens: TokenEntry[]; categories: TokenCategory[]; canonical: string } {
  const { canonical, aliases } = parseConceptEditorLine(editorLine);

  let nextTokens = tokens;
  const exists = nextTokens.some((t) => t.text === canonical && isCanonicalToken(t));
  if (!exists) {
    nextTokens = addToken(nextTokens, canonical);
  }

  let nextCategories = categories;
  if (activeCategoryKey === NO_CATEGORY_SENTINEL) {
    nextCategories = moveTokensToRoot(nextCategories, [canonical]);
  } else {
    nextCategories = addTokenToCategorySorted(nextCategories, activeCategoryKey, canonical);
  }

  nextTokens = syncAliasesForCanonical(nextTokens, canonical, aliases);

  return { tokens: nextTokens, categories: nextCategories, canonical };
}
