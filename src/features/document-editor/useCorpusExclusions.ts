/**
 * Document-level manual corpus exclusions: whole rows or path segments (incl. single occurrence).
 */
import { useCallback, useEffect, useState } from 'react';
import type { CorpusItemExclusions, CorpusSegmentExclusions } from '../../lib/corpusItemPaths';
import {
  addCorpusItemExclusion,
  addSegmentExclusion,
  addSegmentOccurrenceExclusion,
  removeCorpusItemExclusion,
} from '../../lib/corpusSegmentationOverrides';
import { segmentExclusionKeyOccurrence } from '../../lib/corpusExclusionKeys';

export function useCorpusExclusions(documentId: string): {
  corpusSegmentExclusions: CorpusSegmentExclusions;
  corpusItemExclusions: CorpusItemExclusions;
  removeCorpusSegment: (sourceText: string, segmentText: string) => void;
  excludeCorpusSegmentOccurrence: (
    sourceText: string,
    segmentText: string,
    occurrenceIndex1Based: number,
  ) => void;
  excludeCorpusItem: (sourceText: string) => void;
  restoreCorpusItem: (sourceText: string) => void;
} {
  const [segmentExclusions, setSegmentExclusions] = useState<Map<string, Set<string>>>(() => new Map());
  const [itemExclusions, setItemExclusions] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setSegmentExclusions(new Map());
    setItemExclusions(new Set());
  }, [documentId]);

  const removeCorpusSegment = useCallback((sourceText: string, segmentText: string) => {
    const key = sourceText.trim();
    if (!key || !segmentText) return;
    setSegmentExclusions((prev) => {
      const next = new Map(prev);
      next.set(key, addSegmentExclusion(next.get(key) ?? new Set(), segmentText));
      return next;
    });
  }, []);

  const excludeCorpusSegmentOccurrence = useCallback((
    sourceText: string,
    segmentText: string,
    occurrenceIndex1Based: number,
  ) => {
    const key = sourceText.trim();
    if (!key || !segmentText || occurrenceIndex1Based < 1) return;
    setSegmentExclusions((prev) => {
      const next = new Map(prev);
      next.set(
        key,
        addSegmentOccurrenceExclusion(next.get(key) ?? new Set(), segmentText, occurrenceIndex1Based),
      );
      return next;
    });
  }, []);

  const excludeCorpusItem = useCallback((sourceText: string) => {
    const key = sourceText.trim();
    if (!key) return;
    setItemExclusions((prev) => addCorpusItemExclusion(prev, key));
  }, []);

  const restoreCorpusItem = useCallback((sourceText: string) => {
    const key = sourceText.trim();
    if (!key) return;
    setItemExclusions((prev) => removeCorpusItemExclusion(prev, key));
  }, []);

  return {
    corpusSegmentExclusions: segmentExclusions,
    corpusItemExclusions: itemExclusions,
    removeCorpusSegment,
    excludeCorpusSegmentOccurrence,
    excludeCorpusItem,
    restoreCorpusItem,
  };
}

export { segmentExclusionKeyOccurrence };
