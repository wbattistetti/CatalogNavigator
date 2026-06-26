/**
 * Cross-slot fill during pending disambiguation: accept alternate category answers
 * that match the current candidate set.
 */
import type { BundleCorpusItem } from './agentBundleTypes';
import type { TokenCategory } from './dictionaryTree';
import type { TokenEntry } from './tokenDictionary';
import { matchTextToSlots, scorePathsBySlots } from './slotExtract';

/**
 * When pending category was not answered, returns slots extracted for other categories
 * that still match at least one current candidate path.
 */
export function crossSlotSlotsDuringPending(
  input: string,
  pendingCategoryKey: string | null | undefined,
  resolvedSlots: Record<string, string>,
  tokens: TokenEntry[],
  categories: TokenCategory[],
  itemPaths: string[],
  corpusItems: BundleCorpusItem[],
): Record<string, string> | null {
  if (!pendingCategoryKey?.trim()) return null;

  const newSlots = matchTextToSlots(input.toLowerCase(), tokens, categories);
  if (newSlots[pendingCategoryKey] != null) return null;

  const crossEntries = Object.entries(newSlots).filter(([key]) => key !== pendingCategoryKey);
  if (crossEntries.length === 0) return null;

  const crossOnly = Object.fromEntries(crossEntries);
  const trialMerged = { ...resolvedSlots, ...crossOnly };
  const { maxCount } = scorePathsBySlots(itemPaths, corpusItems, trialMerged);
  if (maxCount === 0) return null;

  return crossOnly;
}
