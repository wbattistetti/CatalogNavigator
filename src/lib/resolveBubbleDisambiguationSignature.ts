/**
 * Resolves a disambiguation plan signature from chat bubble metadata.
 */
import { buildDisambiguationSignature } from './compileDisambiguationPlan';

export interface BubbleDisambiguationRef {
  disambiguationSignature?: string;
  disambiguationCategory?: string;
  disambiguationOptions?: readonly string[];
}

/** Returns plan signature for navigation — builds from category+options when VB omitted it. */
export function resolveBubbleDisambiguationSignature(
  ref: BubbleDisambiguationRef,
): string | null {
  const explicit = ref.disambiguationSignature?.trim();
  if (explicit) return explicit;

  const category = ref.disambiguationCategory?.trim();
  const options = (ref.disambiguationOptions ?? [])
    .map((o) => o.trim())
    .filter(Boolean);
  if (!category || options.length === 0) return null;

  return buildDisambiguationSignature(category, [...options]);
}
