/**
 * Unit tests for tabular cell expand overlay sizing.
 */
import { describe, expect, it } from 'vitest';
import { estimateTabularExpandEditorSize } from './tabularExpandCellLayout';

describe('estimateTabularExpandEditorSize', () => {
  it('grows height for long wrapped text', () => {
    const short = estimateTabularExpandEditorSize('abc', 300);
    const long = estimateTabularExpandEditorSize('x'.repeat(400), 300);
    expect(long.height).toBeGreaterThan(short.height);
  });

  it('respects minimum width from column', () => {
    const { width } = estimateTabularExpandEditorSize('test', 120);
    expect(width).toBeGreaterThanOrEqual(280);
  });
});
