/**
 * Tests for Glide corpus cell wrap layout estimates.
 */
import { describe, expect, it } from 'vitest';
import {
  chipPillLayoutLineCount,
  corpusGlideRowHeight,
  estimateChipPillLines,
  estimateCorpusGlideRowHeight,
  estimateWrappedTextLines,
  monospaceTextMeasure,
} from './glideWrapLayout';

describe('glideWrapLayout', () => {
  const measure = monospaceTextMeasure(6);

  it('estimates more lines for long description text', () => {
    const short = estimateWrappedTextLines('visita cardiologica', 200, measure);
    const long = estimateWrappedTextLines(
      'PRIMA VISITA SPECIALISTICA CARDIOLOGICA PEDIATRICA + ECG + ECOCOLORDOPPLER CARDIACO DA 5 SETTIMANE',
      200,
      measure,
    );
    expect(long).toBeGreaterThan(short);
  });

  it('estimates chip rows when many segments', () => {
    const paints = ['cardiologica', 'prima', 'ecg', 'ecocolordoppler', 'over 17 anni'].map((text) => ({
      text,
      bgColor: '#000',
      borderColor: '#111',
      fgColor: '#fff',
    }));
    const lines = estimateChipPillLines(paints, 3, 180, measure);
    expect(lines).toBeGreaterThan(1);
  });

  it('computes row height from description and segmentation lines', () => {
    const height = corpusGlideRowHeight([4, 2]);
    expect(height).toBeGreaterThanOrEqual(48);
  });

  it('estimates corpus row height from glide row inputs', () => {
    const height = estimateCorpusGlideRowHeight({
      sourceText: 'PRIMA VISITA CARDIOLOGICA PEDIATRICA + ECG + ECOCOLORDOPPLER CARDIACO',
      descriptionRuns: [],
      segmentTexts: ['cardiologica', 'prima', 'ecg', 'ecocolordoppler'],
      unmatchedCount: 2,
      descriptionColWidth: 400,
      segmentationColWidth: 360,
      extraColWidth: 160,
    });
    expect(height).toBeGreaterThanOrEqual(48);
  });

  it('chipPillLayoutLineCount adds a line when unmatched label wraps', () => {
    const measure = monospaceTextMeasure(8);
    const paints = Array.from({ length: 6 }, (_, i) => ({
      text: `token-${i}`,
      bgColor: '#000',
      borderColor: '#111',
      fgColor: '#fff',
    }));
    const tight = chipPillLayoutLineCount(paints, 5, 120, measure);
    const wide = chipPillLayoutLineCount(paints, 5, 800, measure);
    expect(tight).toBeGreaterThanOrEqual(wide);
  });
});
