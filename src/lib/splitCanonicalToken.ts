/**
 * Splits one canonical dictionary token into two tokens at a text selection.
 */
import {
  getCategoryIdForToken,
  addTokenToCategorySorted,
  removeTokenFromLayout,
} from './dictionaryTree';
import type { TokenCategory } from './dictionaryTree';
import {
  addToken,
  isCanonicalToken,
  normalizeDescriptionText,
  removeAlias,
  removeCanonicalToken,
  tokenizeToWords,
  trimSelectionRange,
  type TokenEntry,
} from './tokenDictionary';

export interface TokenSplitParts {
  head: string;
  tail: string;
}

/** Validates a selection inside a token and returns head + tail phrases. */
export function splitPartsFromTokenSelection(
  originalText: string,
  start: number,
  end: number,
): TokenSplitParts {
  const source = originalText.trim();
  if (!source) throw new Error('Token vuoto');

  const range = trimSelectionRange(source, start, end);
  if (range.start >= range.end) {
    throw new Error('Seleziona una parte del token da separare');
  }

  const head = normalizeDescriptionText(source.slice(range.start, range.end));
  const tailRaw = `${source.slice(0, range.start)} ${source.slice(range.end)}`.trim();
  const tail = normalizeDescriptionText(tailRaw);

  if (!head || !tail) {
    throw new Error('La selezione deve lasciare due parti non vuote');
  }
  if (head === tail || head === source || tail === source) {
    throw new Error('Selezione non valida per la divisione');
  }

  const origWords = tokenizeToWords(normalizeDescriptionText(source));
  const headWords = tokenizeToWords(head);
  const tailWords = tokenizeToWords(tail);
  if (headWords.length + tailWords.length !== origWords.length) {
    throw new Error('La selezione deve rispettare i confini delle parole');
  }

  const origJoined = origWords.join('\u001f');
  const rebuilt = [...headWords, ...tailWords].join('\u001f');
  if (origJoined !== rebuilt) {
    throw new Error('Le due parti devono ricomporre il token originale nell\'ordine corretto');
  }

  return { head, tail };
}

/** Applies a validated split: removes the original token and adds head + tail. */
export function applyCanonicalTokenSplit(
  tokens: TokenEntry[],
  categories: TokenCategory[],
  originalText: string,
  parts: TokenSplitParts,
): { tokens: TokenEntry[]; categories: TokenCategory[] } {
  const canonical = tokens.find((t) => t.text === originalText && isCanonicalToken(t));
  if (!canonical) throw new Error(`Token non trovato: ${originalText}`);

  if (tokens.some((t) => t.text === parts.head && isCanonicalToken(t) && parts.head !== originalText)) {
    throw new Error(`Il token «${parts.head}» esiste già`);
  }
  if (tokens.some((t) => t.text === parts.tail && isCanonicalToken(t) && parts.tail !== originalText)) {
    throw new Error(`Il token «${parts.tail}» esiste già`);
  }

  const categoryId = getCategoryIdForToken(originalText, categories);

  let nextTokens = removeCanonicalToken(tokens, originalText);
  for (const t of tokens) {
    if (t.aliasOf === originalText) {
      nextTokens = removeAlias(nextTokens, t.text);
    }
  }

  nextTokens = addToken(nextTokens, parts.head);
  nextTokens = addToken(nextTokens, parts.tail);

  let nextCategories = removeTokenFromLayout(categories, originalText);
  if (categoryId) {
    nextCategories = addTokenToCategorySorted(nextCategories, categoryId, parts.head);
    nextCategories = addTokenToCategorySorted(nextCategories, categoryId, parts.tail);
  }

  return { tokens: nextTokens, categories: nextCategories };
}
