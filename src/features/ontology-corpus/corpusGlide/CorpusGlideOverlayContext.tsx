/**
 * Overlay context for interactive corpus Glide cell editors.
 */
import { createContext, useContext, type MouseEvent, type ReactNode } from 'react';
import type { TokenCategory } from '../../../lib/dictionaryTree';
import type { HighlightSpan, MatchPhrase } from '../../../lib/tokenDictionary';
import type { LoadedDictionaryRef } from '../../../lib/multiDictionarySegment';

export interface CorpusGlideOverlayContextValue {
  matchPhrases: MatchPhrase[];
  liveLoadedRefs: LoadedDictionaryRef[];
  editingDictionaryId: string | null;
  categories: TokenCategory[];
  editableCanonicalSet: ReadonlySet<string>;
  onRemoveSpan: (span: HighlightSpan) => void;
  onRemoveCanonical: (token: string) => void;
  onMouseDown: (e: MouseEvent) => void;
  onDoubleClick: (e: MouseEvent, sourceText: string) => void;
  onMouseUp: (e: MouseEvent, sourceText: string) => void;
  onContextMenu: (e: MouseEvent, sourceText: string) => void;
}

const CorpusGlideOverlayContext = createContext<CorpusGlideOverlayContextValue | null>(null);

export function CorpusGlideOverlayProvider({
  value,
  children,
}: {
  value: CorpusGlideOverlayContextValue;
  children: ReactNode;
}) {
  return (
    <CorpusGlideOverlayContext.Provider value={value}>
      {children}
    </CorpusGlideOverlayContext.Provider>
  );
}

export function useCorpusGlideOverlay(): CorpusGlideOverlayContextValue {
  const ctx = useContext(CorpusGlideOverlayContext);
  if (!ctx) {
    throw new Error('useCorpusGlideOverlay requires CorpusGlideOverlayProvider');
  }
  return ctx;
}
