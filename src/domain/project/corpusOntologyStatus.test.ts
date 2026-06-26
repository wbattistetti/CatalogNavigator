/**
 * Tests for corpus ontology status resolution.
 */
import { describe, expect, it } from 'vitest';
import { resolveCorpusOntologyStatus } from './corpusOntologyStatus';

const base = {
  layoutStable: true,
  layoutStabilizing: false,
  loadingPersisted: false,
  segmentationReady: false,
  segmentationStale: false,
  partialSaved: false,
  partialProcessed: 0,
  partialTotal: 0,
};

describe('resolveCorpusOntologyStatus', () => {
  it('reports ready when segmentation cache is complete', () => {
    expect(resolveCorpusOntologyStatus({ ...base, segmentationReady: true }).phase).toBe('ready');
  });

  it('reports stale when saved signature drifted', () => {
    const status = resolveCorpusOntologyStatus({ ...base, segmentationStale: true });
    expect(status.phase).toBe('stale');
    expect(status.message).toContain('Ricrea ontologia');
  });

  it('reports stabilizing while linked dictionaries load', () => {
    expect(resolveCorpusOntologyStatus({
      ...base,
      layoutStable: false,
      layoutStabilizing: true,
    }).phase).toBe('stabilizing');
  });
});
