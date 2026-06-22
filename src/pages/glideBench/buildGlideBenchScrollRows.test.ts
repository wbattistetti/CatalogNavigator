/**
 * Tests for scroll-only Glide benchmark row builder.
 */
import { describe, expect, it } from 'vitest';
import { buildGlideBenchScrollRows } from './buildGlideBenchScrollRows';

describe('buildGlideBenchScrollRows', () => {
  it('builds colored chips from description columns without segmentation', () => {
    const tabular = {
      headers: ['medicinale_veterinario', 'principio_attivo'],
      rows: [
        ['ANTIVERMINTICO CANDIOLI', 'IVERMECTINA'],
        ['PORCILIS ERY', 'ERY'],
      ],
    };

    const rows = buildGlideBenchScrollRows(tabular);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.paints).toHaveLength(2);
    expect(rows[0]?.paints[0]?.text).toBe('ANTIVERMINTICO CANDIOLI');
    expect(rows[0]?.segmentation.unmatched).toEqual([]);
    expect(rows[0]?.paints[0]?.bgColor).toMatch(/^#[0-9a-f]{8}$/i);
  });
});
