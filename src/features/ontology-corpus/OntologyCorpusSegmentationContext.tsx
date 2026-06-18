/**
 * Panel-level corpus segmentation cache (full corpus; filter does not invalidate).
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import {
  lookupCorpusSegmentation,
  useSegmentationCache,
  type SegmentationCacheProgress,
} from '../../hooks/useSegmentationCache';
import type { CorpusSegmentationEntry } from '../../lib/corpusSegmentationCache';
import type { LoadedDictionaryRef } from '../../lib/multiDictionarySegment';
import type { TokenCategory } from '../../lib/dictionaryTree';
import { buildTaggedMatchPhrases } from '../../lib/multiDictionarySegment';

export interface OntologyCorpusSegmentationValue {
  cache: Map<string, CorpusSegmentationEntry>;
  progress: SegmentationCacheProgress;
  matchPhrases: ReturnType<typeof buildTaggedMatchPhrases>;
  lookup: (text: string) => CorpusSegmentationEntry | undefined;
  setPriorityTexts: (texts: string[]) => void;
}

const OntologyCorpusSegmentationContext = createContext<OntologyCorpusSegmentationValue | null>(null);

export function OntologyCorpusSegmentationProvider({
  corpusTexts,
  liveLoadedRefs,
  categories,
  enabled = true,
  children,
}: {
  corpusTexts: string[];
  liveLoadedRefs: LoadedDictionaryRef[];
  categories: TokenCategory[];
  enabled?: boolean;
  children: ReactNode;
}) {
  const priorityRef = useRef<string[]>([]);
  const getPriorityTexts = useRef(() => priorityRef.current).current;

  const { cache, progress, matchPhrases } = useSegmentationCache(
    corpusTexts,
    liveLoadedRefs,
    categories,
    { enabled, getPriorityTexts },
  );

  const value = useMemo((): OntologyCorpusSegmentationValue => ({
    cache,
    progress,
    matchPhrases,
    lookup: (text) => lookupCorpusSegmentation(cache, text),
    setPriorityTexts: (texts) => {
      priorityRef.current = texts;
    },
  }), [cache, progress, matchPhrases]);

  return (
    <OntologyCorpusSegmentationContext.Provider value={value}>
      {children}
    </OntologyCorpusSegmentationContext.Provider>
  );
}

export function useOntologyCorpusSegmentation(): OntologyCorpusSegmentationValue {
  const ctx = useContext(OntologyCorpusSegmentationContext);
  if (!ctx) {
    throw new Error('useOntologyCorpusSegmentation must be used within OntologyCorpusSegmentationProvider');
  }
  return ctx;
}

/** Updates viewport-priority texts without invalidating the full-corpus cache. */
export function useOntologyCorpusSegmentationPriority(visibleTexts: string[]): void {
  const { setPriorityTexts } = useOntologyCorpusSegmentation();
  useEffect(() => {
    setPriorityTexts(visibleTexts);
  }, [visibleTexts, setPriorityTexts]);
}
