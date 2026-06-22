import { describe, expect, it } from 'vitest';
import {
  corpusSegmentationCacheFromEntries,
  corpusSegmentationEntriesFromCache,
  isPersistedSegmentationComplete,
  parsePersistedSegmentationEntries,
  sanitizeCorpusSegmentationEntry,
} from './persistCorpusSegmentation';
import { sanitizeStringForPostgresJsonb } from './postgresJsonbStrings';

const sampleEntry: CorpusSegmentationEntry = {
  segments: [{ text: 'foo', token: 'foo', dictionaryId: 'dict-1' }],
  unmatched: [],
  path: 'root/foo',
};

describe('parsePersistedSegmentationEntries', () => {
  it('parses valid entries and skips invalid keys', () => {
    const parsed = parsePersistedSegmentationEntries({
      '  hello  ': sampleEntry,
      '': { segments: [] },
      bad: null,
      'no-segments': { unmatched: [], path: 'x' },
    });
    expect(parsed).toEqual({ hello: sampleEntry });
  });
});

describe('corpusSegmentation cache round-trip', () => {
  it('converts between Map and Record', () => {
    const map = corpusSegmentationCacheFromEntries({ a: sampleEntry });
    const record = corpusSegmentationEntriesFromCache(map);
    expect(record).toEqual({ a: sampleEntry });
    expect(corpusSegmentationCacheFromEntries(record).get('a')).toEqual(sampleEntry);
  });
});

describe('isPersistedSegmentationComplete', () => {
  it('marks complete when entry count reaches target', () => {
    expect(isPersistedSegmentationComplete(100, 100)).toBe(true);
    expect(isPersistedSegmentationComplete(101, 100)).toBe(true);
    expect(isPersistedSegmentationComplete(50, 100)).toBe(false);
    expect(isPersistedSegmentationComplete(0, 100)).toBe(false);
  });
});

describe('sanitizeStringForPostgresJsonb', () => {
  it('removes NUL characters rejected by PostgreSQL jsonb', () => {
    expect(sanitizeStringForPostgresJsonb('a\u0000b')).toBe('ab');
    expect(sanitizeCorpusSegmentationEntry({
      ...sampleEntry,
      path: 'root\u0000/foo',
      unmatched: ['x\u0000y'],
      segments: [{ text: 'foo\u0000', dictionaryId: 'd\u00001' }],
    })).toEqual({
      segments: [{ text: 'foo', dictionaryId: 'd1' }],
      unmatched: ['xy'],
      path: 'root/foo',
    });
  });

  it('strips NUL from cache keys when exporting entries', () => {
    const map = corpusSegmentationCacheFromEntries({ 'hello\u0000': sampleEntry });
    const record = corpusSegmentationEntriesFromCache(map);
    expect(record).toHaveProperty('hello');
    expect(record.hello).toEqual(sampleEntry);
  });
});
