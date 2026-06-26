import { describe, expect, it } from 'vitest';
import { buildDisambiguationSignature } from './compileDisambiguationPlan';
import { resolveBubbleDisambiguationSignature } from './resolveBubbleDisambiguationSignature';

describe('resolveBubbleDisambiguationSignature', () => {
  it('returns explicit signature when present', () => {
    expect(resolveBubbleDisambiguationSignature({
      disambiguationSignature: 'esame||ecg||optional_include',
      disambiguationCategory: 'esame',
      disambiguationOptions: ['ecg', 'none'],
    })).toBe('esame||ecg||optional_include');
  });

  it('builds signature from category and options for Template VB bubbles', () => {
    const options = ['ecg', 'ecg+ecocolordoppler', 'ecg+ecodoppler', 'none'];
    expect(resolveBubbleDisambiguationSignature({
      disambiguationCategory: 'esame',
      disambiguationOptions: options,
    })).toBe(buildDisambiguationSignature('esame', options));
  });
});
