/**
 * Shared drag-and-drop helpers for dictionary token lists and corpus chips.
 */
import {
  NO_CATEGORY_SENTINEL,
  addTokenToCategorySorted,
  moveTokensToRoot,
  type TokenCategory,
} from './dictionaryTree';

export const TOKEN_DRAG_MIME = 'application/x-dictionary-tokens';
export const TOKEN_DRAG_PLAIN_PREFIX = 'dict-tokens:';
export const CATEGORY_DRAG_MIME = 'application/x-dictionary-category';
export const DRAG_THRESHOLD_PX = 4;

export function isTokenDragEvent(e: React.DragEvent): boolean {
  const types = [...e.dataTransfer.types];
  return types.includes(TOKEN_DRAG_MIME)
    || (types.includes('text/plain') && !types.includes(CATEGORY_DRAG_MIME));
}

export function parseTokenDragPayload(e: React.DragEvent): string[] | null {
  const raw = e.dataTransfer.getData(TOKEN_DRAG_MIME)
    || e.dataTransfer.getData('text/plain');
  if (!raw) return null;
  const json = raw.startsWith(TOKEN_DRAG_PLAIN_PREFIX)
    ? raw.slice(TOKEN_DRAG_PLAIN_PREFIX.length)
    : raw;
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((t) => typeof t === 'string')) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function tokenDragPayload(texts: string[]): string {
  return JSON.stringify(texts);
}

export function categoryIdAtPoint(clientX: number, clientY: number): string | null {
  const el = document.elementFromPoint(clientX, clientY);
  return el?.closest('[data-category-id]')?.getAttribute('data-category-id') ?? null;
}

export function formatDragGhostLabel(texts: string[]): string {
  if (texts.length === 1) return texts[0]!;
  const preview = texts.slice(0, 3).join(', ');
  const extra = texts.length > 3 ? `… +${texts.length - 3}` : '';
  return `${texts.length} token · ${preview}${extra}`;
}

/** Assigns canonical token texts to a category (or root). */
export function assignTokensToCategory(
  categories: TokenCategory[],
  targetKey: string,
  tokenTexts: string[],
): TokenCategory[] {
  if (tokenTexts.length === 0) return categories;
  if (targetKey === NO_CATEGORY_SENTINEL) {
    return moveTokensToRoot(categories, tokenTexts);
  }
  let next = categories;
  for (const text of tokenTexts) {
    next = addTokenToCategorySorted(next, targetKey, text);
  }
  return next;
}
