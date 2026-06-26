/**
 * Tests for category cardinality settings helpers.
 */
import { describe, expect, it } from 'vitest';
import type { TokenCategory } from './dictionaryTree';
import {
  categorySettingBadges,
  hydrateCategoryFromStorage,
  normalizeCategorySettings,
  serializeCategoryForStorage,
  updateCategorySettings,
} from './categoryCardinality';

const base: TokenCategory = {
  id: 'c1',
  name: 'tipo visita',
  order: 0,
  tokenTexts: ['prima', 'controllo'],
};

describe('normalizeCategorySettings', () => {
  it('clears cardinality and winner for vincolo', () => {
    const next = normalizeCategorySettings({
      ...base,
      type: 'vincolo',
      cardinality: 'multi',
      winner: 'controllo',
    });
    expect(next.type).toBe('vincolo');
    expect(next.cardinality).toBeUndefined();
    expect(next.winner).toBeUndefined();
  });

  it('clears winner when cardinality is multi', () => {
    const next = normalizeCategorySettings({
      ...base,
      cardinality: 'multi',
      winner: 'controllo',
    });
    expect(next.cardinality).toBe('multi');
    expect(next.winner).toBeUndefined();
  });

  it('drops winner not in tokenTexts', () => {
    const next = normalizeCategorySettings({
      ...base,
      winner: 'revisione',
    });
    expect(next.winner).toBeUndefined();
  });
});

describe('updateCategorySettings', () => {
  it('clears winner when switching to multi', () => {
    const categories = [
      { ...base, cardinality: 'single' as const, winner: 'controllo' },
    ];
    const next = updateCategorySettings(categories, 'c1', { cardinality: 'multi' });
    expect(next[0]?.cardinality).toBe('multi');
    expect(next[0]?.winner).toBeUndefined();
  });
});

describe('categorySettingBadges', () => {
  it('shows no badges for default attributo single', () => {
    expect(categorySettingBadges(base)).toEqual([]);
  });

  it('shows winner badge when set', () => {
    const badges = categorySettingBadges({ ...base, winner: 'controllo' });
    expect(badges).toHaveLength(1);
    expect(badges[0]?.label).toBe('winner: controllo');
  });

  it('shows multi badge', () => {
    const badges = categorySettingBadges({ ...base, cardinality: 'multi' });
    expect(badges.map((b) => b.label)).toEqual(['multi']);
  });

  it('shows only vincolo badge for vincolo categories', () => {
    const badges = categorySettingBadges({
      ...base,
      type: 'vincolo',
      winner: 'controllo',
      cardinality: 'multi',
    });
    expect(badges.map((b) => b.variant)).toEqual(['vincolo']);
    expect(badges[0]?.label).toBe('vincolo');
  });
});

describe('serializeCategoryForStorage', () => {
  it('persists vincolo, multi, and winner settings', () => {
    const vincolo = serializeCategoryForStorage({
      ...base,
      type: 'vincolo',
      cardinality: 'multi',
      winner: 'controllo',
    });
    expect(vincolo.type).toBe('vincolo');
    expect(vincolo.cardinality).toBeUndefined();
    expect(vincolo.winner).toBeUndefined();

    const multi = serializeCategoryForStorage({
      ...base,
      cardinality: 'multi',
      winner: 'controllo',
    });
    expect(multi.cardinality).toBe('multi');
    expect(multi.winner).toBeUndefined();

    const winner = serializeCategoryForStorage({
      ...base,
      winner: 'controllo',
    });
    expect(winner.cardinality).toBe('single');
    expect(winner.winner).toBe('controllo');
  });

  it('round-trips through hydrateCategoryFromStorage', () => {
    const stored = serializeCategoryForStorage({
      ...base,
      winner: 'controllo',
    });
    const restored = hydrateCategoryFromStorage(stored);
    expect(restored.winner).toBe('controllo');
    expect(restored.cardinality).toBe('single');
  });
});
