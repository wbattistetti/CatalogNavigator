/**
 * Stable dictionary editor API — does not change when unrelated edit sessions update.
 */
import { createContext, useContext } from 'react';
import type { KbDictionary } from '../../lib/dictionaryLibrary';
import type { TokenCategory } from '../../lib/dictionaryTree';
import type { MoveCategoryTarget } from '../../lib/dictionaryPromotion';
import type { TokenEntry } from '../../lib/tokenDictionary';

export interface DictionaryCatalogApi {
  available: KbDictionary[];
  getDictionaryMeta: (dictionaryId: string) => KbDictionary | null;
  moveCategoryToLibrary: (
    sourceDictionaryId: string,
    categoryId: string,
    target: MoveCategoryTarget,
  ) => Promise<{ source: KbDictionary; target: KbDictionary }>;
}

export interface DictionarySessionActionsApi {
  setSessionTokens: (dictionaryId: string, tokens: TokenEntry[]) => void;
  setSessionCategories: (dictionaryId: string, categories: TokenCategory[]) => void;
}

export const DictionaryCatalogContext = createContext<DictionaryCatalogApi | null>(null);
export const DictionarySessionActionsContext = createContext<DictionarySessionActionsApi | null>(null);

export function useDictionaryCatalog(): DictionaryCatalogApi {
  const ctx = useContext(DictionaryCatalogContext);
  if (!ctx) {
    throw new Error('useDictionaryCatalog must be used within DocumentEditorProvider');
  }
  return ctx;
}

export function useDictionarySessionActions(): DictionarySessionActionsApi {
  const ctx = useContext(DictionarySessionActionsContext);
  if (!ctx) {
    throw new Error('useDictionarySessionActions must be used within DocumentEditorProvider');
  }
  return ctx;
}
