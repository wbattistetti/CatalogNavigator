import { describe, expect, it } from 'vitest';
import { findAllWordSpanMatches } from './phraseMatchEngine';
import { buildWordPhraseMatcher, getWordPhraseMatcher } from './wordPhraseMatcher';

describe('buildWordPhraseMatcher', () => {
  const phrases = [
    { phrase: 'emocromo completo', canonical: 'emocromo completo' },
    { phrase: 'emocromo', canonical: 'emocromo' },
    { phrase: 'test da sforzo', canonical: 'test da sforzo' },
    { phrase: 'prima', canonical: 'prima' },
    { phrase: 'cardiologica', canonical: 'cardiologica' },
  ];

  it('matches same results as brute-force reference on sample text', () => {
    const words = ['emocromo', 'completo', 'prima', 'visita', 'cardiologica'];
    const matcher = buildWordPhraseMatcher(phrases);
    const fast = matcher.findAll(words);
    const viaEngine = findAllWordSpanMatches(words, phrases);
    expect(fast).toEqual(viaEngine);
  });

  it('matches + prefix on first corpus word', () => {
    const words = ['+test', 'da', 'sforzo'];
    const matcher = buildWordPhraseMatcher(phrases);
    const matches = matcher.findAll(words);
    expect(matches.some((m) => m.canonical === 'test da sforzo')).toBe(true);
  });

  it('reuses matcher cache for same phrases array reference', () => {
    const shared = [...phrases];
    expect(getWordPhraseMatcher(shared)).toBe(getWordPhraseMatcher(shared));
  });
});

describe('buildWordPhraseMatcher performance', () => {
  it('scales better than quadratic scan on synthetic corpus', () => {
    const phrases = Array.from({ length: 5000 }, (_, i) => ({
      phrase: `token${i} extra word`,
      canonical: `token${i}`,
    }));
    phrases.push({ phrase: 'needle target phrase', canonical: 'needle' });

    const words = Array.from({ length: 40 }, (_, i) => `word${i}`);
    words.push('needle', 'target', 'phrase');

    const matcher = buildWordPhraseMatcher(phrases);
    const start = performance.now();
    for (let run = 0; run < 200; run++) {
      matcher.findAll(words);
    }
    const fastMs = performance.now() - start;

    const bruteStart = performance.now();
    for (let run = 0; run < 200; run++) {
      const out: unknown[] = [];
      for (const rule of phrases) {
        const parts = rule.phrase.match(/\+[\p{L}\p{N}]+|[\p{L}\p{N}]+/gu) ?? [];
        const partCount = parts.length;
        for (let i = 0; i <= words.length - partCount; i++) {
          let ok = true;
          for (let j = 0; j < partCount; j++) {
            if (words[i + j] !== parts[j]) ok = false;
          }
          if (ok) out.push(rule);
        }
      }
    }
    const bruteMs = performance.now() - bruteStart;

    expect(fastMs).toBeLessThan(bruteMs * 0.5);
  });
});
