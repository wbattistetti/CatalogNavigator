/**
 * Shared drag-and-drop helpers for dictionary token lists and corpus chips.
 */
import {
  NO_CATEGORY_SENTINEL,
  addTokenToCategorySorted,
  moveTokensToRoot,
  type TokenCategory,
} from './dictionaryTree';
import { getDictionarySelectionSnapshot } from '../features/document-editor/dictionarySelectionStore';
import { logCorpusExtraDrop } from './corpusExtraDropDebug';

export const TOKEN_DRAG_MIME = 'application/x-dictionary-tokens';
export const TOKEN_DRAG_PLAIN_PREFIX = 'dict-tokens:';
export const CATEGORY_DRAG_MIME = 'application/x-dictionary-category';
export const DRAG_THRESHOLD_PX = 4;

/** Module-level flag set on HTML5 token dragstart (types may be empty on drop in some browsers). */
let html5TokenDragActive = false;

export function setHtml5TokenDragActive(active: boolean): void {
  html5TokenDragActive = active;
}

export function isHtml5TokenDragActive(): boolean {
  return html5TokenDragActive;
}

export function isTokenDragEvent(e: React.DragEvent): boolean {
  return isTokenDragDataTransfer(e.dataTransfer);
}

/** True when drop carries dictionary token payload (types may be empty on drop in some browsers). */
export function parseTokenDragPayload(e: React.DragEvent): string[] | null {
  return parseTokenDragPayloadFromDataTransfer(e.dataTransfer);
}

export function isTokenDragDataTransfer(dataTransfer: DataTransfer): boolean {
  const types = [...dataTransfer.types];
  if (types.includes(TOKEN_DRAG_MIME)) return true;
  if (types.includes(CATEGORY_DRAG_MIME)) return false;
  if (types.includes('text/plain')) return true;
  if (html5TokenDragActive) return true;
  if (getDictionarySelectionSnapshot().dragActive) return true;
  return false;
}

export function parseTokenDragPayloadFromDataTransfer(dataTransfer: DataTransfer): string[] | null {
  const mimeRaw = dataTransfer.getData(TOKEN_DRAG_MIME);
  const plainRaw = dataTransfer.getData('text/plain');
  const raw = mimeRaw || plainRaw;

  logCorpusExtraDrop('parseTokenDragPayload', {
    types: [...dataTransfer.types],
    mimeRaw: mimeRaw || null,
    plainRaw: plainRaw || null,
    html5TokenDragActive,
    storeDragActive: getDictionarySelectionSnapshot().dragActive,
    storeSelected: [...getDictionarySelectionSnapshot().selected],
  });

  if (raw) {
    const json = raw.startsWith(TOKEN_DRAG_PLAIN_PREFIX)
      ? raw.slice(TOKEN_DRAG_PLAIN_PREFIX.length)
      : raw;
    try {
      const parsed = JSON.parse(json) as unknown;
      if (Array.isArray(parsed) && parsed.every((t) => typeof t === 'string')) {
        return parsed;
      }
    } catch {
      /* fall through to selection snapshot */
    }
  }

  const selected = [...getDictionarySelectionSnapshot().selected];
  if (selected.length > 0) {
    logCorpusExtraDrop('parseTokenDragPayload.fallbackSelection', { selected });
    return selected;
  }

  return null;
}

export function tokenDragPayload(texts: string[]): string {
  return JSON.stringify(texts);
}

export function categoryIdAtPoint(clientX: number, clientY: number): string | null {
  const el = document.elementFromPoint(clientX, clientY);
  return el?.closest('[data-category-id]')?.getAttribute('data-category-id') ?? null;
}

/**
 * Insertion slot (0..rowCount) from pointer Y and row vertical midpoints.
 * Slot N inserts before the row currently at index N; rowCount appends at end.
 */
export function categoryReorderIndexFromMidpoints(clientY: number, rowMidpoints: number[]): number {
  for (let i = 0; i < rowMidpoints.length; i += 1) {
    if (clientY < rowMidpoints[i]!) return i;
  }
  return rowMidpoints.length;
}

/**
 * Insertion slot (0..rowCount) for category reorder from pointer Y within a list root.
 * Slot N inserts before the row currently at index N; rowCount appends at end.
 */
export function categoryReorderIndexAtPoint(clientY: number, listRoot: HTMLElement): number {
  const rows = listRoot.querySelectorAll('[data-category-reorder-id]');
  const midpoints: number[] = [];
  rows.forEach((row) => {
    const rect = row.getBoundingClientRect();
    midpoints.push(rect.top + rect.height / 2);
  });
  return categoryReorderIndexFromMidpoints(clientY, midpoints);
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
