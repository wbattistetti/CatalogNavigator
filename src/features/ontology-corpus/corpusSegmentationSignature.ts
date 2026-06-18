/**
 * Stable cache invalidation key for corpus segmentation (independent of filter order).
 */
import { segmentationCategorySignature } from '../../lib/dictionaryTree';
import { segmentationGrammarSignature } from '../../lib/grammarAwareSegment';
import type { LoadedDictionaryRef } from '../../lib/multiDictionarySegment';
import type { TokenCategory } from '../../lib/dictionaryTree';

function tokenListSignature(tokens: LoadedDictionaryRef['dictionary']['tokens']): string {
  return tokens
    .map((t) => (t.aliasOf ? `${t.text}→${t.aliasOf}` : t.text))
    .sort()
    .join('\u001f');
}

export function loadedRefsSegmentationSignature(loadedRefs: LoadedDictionaryRef[]): string {
  return loadedRefs
    .map((r) => (
      `${r.dictionary.id}:${tokenListSignature(r.dictionary.tokens)}:`
      + `${segmentationCategorySignature(r.dictionary.categories ?? [])}:`
      + `${segmentationGrammarSignature(r.dictionary.categories ?? [])}`
    ))
    .join('|');
}

/** Fast rolling hash — detects corpus edits without joining full text. */
export function corpusContentSignature(descriptions: string[]): string {
  let hash = 0;
  for (const raw of descriptions) {
    const text = raw.trim();
    if (!text) continue;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    hash = ((hash << 5) - hash + 1) | 0;
  }
  return `${descriptions.length}:${hash}`;
}

/** Rebuild segmentation cache only when corpus content or dictionary layout changes. */
export function corpusSegmentationCacheSignature(
  descriptions: string[],
  loadedRefs: LoadedDictionaryRef[],
  fallbackCategories: TokenCategory[],
): string {
  return [
    corpusContentSignature(descriptions),
    loadedRefsSegmentationSignature(loadedRefs),
    segmentationCategorySignature(fallbackCategories),
    segmentationGrammarSignature(fallbackCategories),
  ].join('\0');
}
