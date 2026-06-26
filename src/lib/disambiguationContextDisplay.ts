/**
 * Human-readable disambiguation trigger context (acquired slots + catalog path).
 */
import {
  getCategoryIdForToken,
  normalizeCategoryOrders,
  type CategoryType,
  type TokenCategory,
} from './dictionaryTree';
import type { DisambiguationContextVariant } from './disambiguationParents';
import { normalizeSlotCategoryKey } from './slotExtract';
import { isNoneOption } from './turnAnswerGrammar';

export interface LabeledAcquiredSlot {
  key: string;
  label: string;
  value: string;
  type: CategoryType;
  order: number;
}

export interface DisambiguationDisplayContext {
  slots: LabeledAcquiredSlot[];
  pathPrefix: string | null;
  inlineLabel: string;
  summarySentence: string;
}

function categoryForToken(token: string, categories: TokenCategory[]): TokenCategory | null {
  const id = getCategoryIdForToken(token.trim(), categories);
  if (!id) return null;
  return categories.find((c) => c.id === id) ?? null;
}

/** Merges path prefix segments missing from acquired dialog state. */
export function mergeAcquiredWithPathPrefix(
  pathPrefix: string,
  acquired: Record<string, string>,
  categories: TokenCategory[],
): Record<string, string> {
  const ordered = normalizeCategoryOrders(categories);
  const merged: Record<string, string> = { ...acquired };
  const knownValues = new Set(
    Object.values(acquired)
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean),
  );

  for (const segment of pathPrefix.trim().split('.').filter(Boolean)) {
    const trimmed = segment.trim();
    if (!trimmed || isNoneOption(trimmed) || knownValues.has(trimmed.toLowerCase())) continue;

    const category = categoryForToken(trimmed, ordered);
    if (!category) continue;

    const key = normalizeSlotCategoryKey(category.name);
    if (merged[key]?.trim()) continue;
    merged[key] = trimmed;
    knownValues.add(trimmed.toLowerCase());
  }

  return merged;
}

/** Ordered acquired slots with dictionary category labels. */
export function buildLabeledAcquiredSlots(
  acquired: Record<string, string>,
  categories: TokenCategory[],
): LabeledAcquiredSlot[] {
  const ordered = normalizeCategoryOrders(categories);
  const slots: LabeledAcquiredSlot[] = [];

  for (const [key, rawValue] of Object.entries(acquired)) {
    const value = rawValue?.trim();
    if (!value || isNoneOption(value)) continue;
    const category = ordered.find((c) => normalizeSlotCategoryKey(c.name) === key);
    slots.push({
      key,
      label: category?.name ?? key,
      value,
      type: category?.type === 'vincolo' ? 'vincolo' : 'attributo',
      order: category?.order ?? 999,
    });
  }

  return slots.sort((a, b) => (
    a.order - b.order || a.label.localeCompare(b.label, 'it')
  ));
}

export function formatLabeledAcquiredInline(slots: LabeledAcquiredSlot[]): string {
  if (slots.length === 0) return '—';
  return slots.map((slot) => `${slot.label}: ${slot.value}`).join(' · ');
}

/** Short narrative for authors: what the dialog already knows before this question. */
export function buildDisambiguationTriggerSummary(slots: LabeledAcquiredSlot[]): string {
  if (slots.length === 0) return '';

  const vincoli = slots.filter((slot) => slot.type === 'vincolo');
  const attributi = slots.filter((slot) => slot.type === 'attributo');

  const attributiPhrase = attributi
    .map((slot) => `${slot.label.toLowerCase()} «${slot.value}»`)
    .join(', ');

  if (vincoli.length === 0) {
    return attributiPhrase
      ? `Il paziente ha già indicato ${attributiPhrase}.`
      : '';
  }

  const vincoliPhrase = vincoli
    .map((slot) => `${slot.label.toLowerCase()} ${slot.value}`)
    .join(', ');

  if (!attributiPhrase) {
    return `Vincoli già risolti: ${vincoliPhrase}.`;
  }

  return `Il paziente ha già indicato ${attributiPhrase}, con ${vincoliPhrase} già acquisito.`;
}

export function resolveDisambiguationDisplayContext(
  variant: DisambiguationContextVariant,
  categories: TokenCategory[] = [],
): DisambiguationDisplayContext {
  const pathPrefix = variant.pathPrefix.trim() && variant.pathPrefix !== '—'
    ? variant.pathPrefix.trim()
    : null;

  const mergedAcquired = categories.length > 0 && pathPrefix
    ? mergeAcquiredWithPathPrefix(pathPrefix, variant.acquired ?? {}, categories)
    : { ...(variant.acquired ?? {}) };

  const slots = categories.length > 0
    ? buildLabeledAcquiredSlots(mergedAcquired, categories)
    : buildLabeledAcquiredSlotsFromRaw(mergedAcquired);

  return {
    slots,
    pathPrefix,
    inlineLabel: formatLabeledAcquiredInline(slots),
    summarySentence: buildDisambiguationTriggerSummary(slots),
  };
}

function buildLabeledAcquiredSlotsFromRaw(acquired: Record<string, string>): LabeledAcquiredSlot[] {
  return Object.entries(acquired)
    .filter(([, value]) => value?.trim())
    .map(([key, value], index) => ({
      key,
      label: key,
      value: value.trim(),
      type: 'attributo' as const,
      order: index,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'it'));
}

/** Compact header for the editor context accordion. */
export function buildDisambiguationContextAccordionLabel(input: {
  categoryName: string;
  variant: DisambiguationContextVariant | null;
  categories?: TokenCategory[];
  fallbackLabel?: string;
}): string {
  const category = input.categoryName.trim();
  const categoryPart = category ? `«${category}»` : 'disambiguazione';

  if (!input.variant) {
    return input.fallbackLabel ?? `Contesto → ${categoryPart}`;
  }

  const display = resolveDisambiguationDisplayContext(input.variant, input.categories ?? []);
  if (display.inlineLabel !== '—') {
    return `Si chiede dopo ${display.inlineLabel} → ${categoryPart}`;
  }
  if (display.pathPrefix) {
    return `Si chiede quando ${display.pathPrefix} → ${categoryPart}`;
  }
  return input.fallbackLabel ?? `Contesto → ${categoryPart}`;
}
