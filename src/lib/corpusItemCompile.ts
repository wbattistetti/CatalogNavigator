/**
 * Compiles corpus items with vincolo age constraints — shared by agent bundle and disambiguation plan.
 */
import type { BundleCorpusItem, BundleCorpusSegment, CompiledConstraint } from './agentBundleTypes';
import { parseAgeConstraintToken } from './ageConstraintParse';
import type { TokenCategory } from './dictionaryTree';
import { buildCorpusItemsFromPaths } from './slotExtract';

function compileVincoloConstraint(
  tokenText: string,
  categoryName: string,
  warnings: string[],
  path: string,
): CompiledConstraint | null {
  const ageRange = parseAgeConstraintToken(tokenText);
  if (ageRange) {
    return {
      kind: 'age_years',
      categoryName,
      askKey: 'age_years',
      min: ageRange.min,
      max: ageRange.max,
      minMonths: ageRange.minMonths,
      maxMonths: ageRange.maxMonths,
      minWeeks: ageRange.minWeeks,
      maxWeeks: ageRange.maxWeeks,
      sourceToken: tokenText,
    };
  }

  warnings.push(
    `Vincolo non compilabile su ${path}: "${tokenText}" (categoria "${categoryName}")`,
  );
  return null;
}

/** Compiles age_years constraints from vincolo path segments. */
export function compileConstraintsForPath(
  segments: BundleCorpusSegment[],
  path: string,
  warnings: string[] = [],
): CompiledConstraint[] {
  const out: CompiledConstraint[] = [];
  for (const seg of segments) {
    if (seg.categoryType !== 'vincolo') continue;
    const compiled = compileVincoloConstraint(seg.text, seg.categoryName, warnings, path);
    if (compiled) out.push(compiled);
  }
  return out;
}

/** Builds corpus items from paths with compiled vincolo constraints (matches compileAgentBundle). */
export function buildCorpusItemsWithConstraints(
  itemPaths: string[],
  categories: TokenCategory[],
): BundleCorpusItem[] {
  const base = buildCorpusItemsFromPaths(itemPaths, categories);
  return base.map((item) => ({
    ...item,
    constraints: compileConstraintsForPath(item.segments, item.path, []),
  }));
}
