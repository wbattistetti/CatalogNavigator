/**
 * Parse and apply canonical token lines with optional aliases (editor syntax: "canonico: syn1, syn2").
 * Persists as flat TokenEntry[] with aliasOf — no schema change.
 */
import {
  addTokenToCategorySorted,
  getCategoryIdForToken,
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

function categoryLabelForCanonical(canonical: string, categories: TokenCategory[]): string {
  const categoryId = getCategoryIdForToken(canonical, categories);
  if (categoryId === null) return 'senza categoria';
  return categoryDisplayName(categories, categoryId);
}

function syncAliasesForCanonical(
  tokens: TokenEntry[],
  categories: TokenCategory[],
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
      const where = categoryLabelForCanonical(alias, categories);
      throw new Error(
        `"${alias}" è già un token canonico nella categoria «${where}»`,
      );
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
  nextTokens = syncAliasesForCanonical(nextTokens, nextCategories, newCanonical, desiredAliases);

  return { tokens: nextTokens, categories: nextCategories, canonical: newCanonical };
}

function resolveTargetCategoryId(activeCategoryKey: string): string | null {
  return activeCategoryKey === NO_CATEGORY_SENTINEL ? null : activeCategoryKey;
}

function categoryDisplayName(categories: TokenCategory[], categoryId: string): string {
  return categories.find((c) => c.id === categoryId)?.name?.trim() || 'Categoria';
}

export interface ApplyNewConceptLineResult {
  tokens: TokenEntry[];
  categories: TokenCategory[];
  canonical: string;
  /** Set when an existing canonical is recategorized into the active bucket. */
  notice?: string;
}

function assertNotDuplicateInTargetBucket(
  categories: TokenCategory[],
  activeCategoryKey: string,
  canonical: string,
): void {
  const currentCategoryId = getCategoryIdForToken(canonical, categories);
  const targetCategoryId = resolveTargetCategoryId(activeCategoryKey);

  if (currentCategoryId !== targetCategoryId) return;

  if (targetCategoryId === null) {
    throw new Error(`«${canonical}» è già nel dizionario (senza categoria)`);
  }
  throw new Error(`«${canonical}» è già in questa categoria`);
}

/**
 * Adds a new canonical (and optional aliases) from the editor / "Nuovo token" field.
 * Reuses an existing canonical and moves it when it lives in another category.
 */
export function applyNewConceptLine(
  tokens: TokenEntry[],
  categories: TokenCategory[],
  activeCategoryKey: string,
  editorLine: string,
): ApplyNewConceptLineResult {
  const { canonical, aliases } = parseConceptEditorLine(editorLine);

  let nextTokens = tokens;
  let notice: string | undefined;
  const exists = nextTokens.some((t) => t.text === canonical && isCanonicalToken(t));
  if (exists) {
    assertNotDuplicateInTargetBucket(categories, activeCategoryKey, canonical);
    const fromCategoryId = getCategoryIdForToken(canonical, categories);
    if (fromCategoryId) {
      const name = categoryDisplayName(categories, fromCategoryId);
      notice = `«${canonical}» spostato dalla categoria «${name}»`;
    }
  } else {
    nextTokens = addToken(nextTokens, canonical);
  }

  let nextCategories = categories;
  if (activeCategoryKey === NO_CATEGORY_SENTINEL) {
    nextCategories = moveTokensToRoot(nextCategories, [canonical]);
  } else {
    nextCategories = addTokenToCategorySorted(nextCategories, activeCategoryKey, canonical);
  }

  nextTokens = syncAliasesForCanonical(nextTokens, nextCategories, canonical, aliases);

  return { tokens: nextTokens, categories: nextCategories, canonical, notice };
}
