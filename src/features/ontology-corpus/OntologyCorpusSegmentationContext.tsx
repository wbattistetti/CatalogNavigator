/**
 * Panel-level corpus segmentation cache (full corpus; filter does not invalidate).
 */
import {
  createContext,
  useContext,
  type ReactNode,
} from 'react';
import type { SegmentationCacheProgress } from '../../hooks/usePersistedSegmentationCache';
import type { CorpusSegmentationEntry } from '../../lib/corpusSegmentationCache';
import { buildTaggedMatchPhrases } from '../../lib/multiDictionarySegment';

export interface OntologyCorpusSegmentationValue {
  cache: Map<string, CorpusSegmentationEntry>;
  progress: SegmentationCacheProgress;
  matchPhrases: ReturnType<typeof buildTaggedMatchPhrases>;
  lookup: (text: string) => CorpusSegmentationEntry | undefined;
  removeSegment: (sourceText: string, segmentText: string) => void;
  loadingPersisted: boolean;
  building: boolean;
  stale: boolean;
}

const OntologyCorpusSegmentationContext = createContext<OntologyCorpusSegmentationValue | null>(null);

export function OntologyCorpusSegmentationProvider({
  value,
  children,
}: {
  value: OntologyCorpusSegmentationValue;
  children: ReactNode;
}) {
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
