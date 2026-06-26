/**
 * Tests for unified project save orchestration.
 */
import { describe, expect, it, vi } from 'vitest';
import { saveProjectBundle } from './saveProjectBundle';

describe('saveProjectBundle', () => {
  it('saves all dirty dictionaries before analysis', async () => {
    const order: string[] = [];
    const saveAllDirtyDictionaries = vi.fn(async () => {
      order.push('dictionaries');
      return [];
    });
    const saveAnalysis = vi.fn(async () => {
      order.push('analysis');
    });

    await saveProjectBundle({ saveAllDirtyDictionaries, saveAnalysis });

    expect(order).toEqual(['dictionaries', 'analysis']);
    expect(saveAllDirtyDictionaries).toHaveBeenCalledOnce();
    expect(saveAnalysis).toHaveBeenCalledOnce();
  });
});
