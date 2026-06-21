/**
 * Builds the full dialog test plan from a compiled AgentBundle (static canonical scripts).
 */
import type { AgentBundle } from '../agentBundleTypes';
import { buildGuidedPathToTarget } from '../compileDisambiguationPlan';
import type { TokenCategory } from '../dictionaryTree';
import type { RowSegmentation } from '../tokenDictionary';
import {
  buildCanonicalDialogScripts,
  buildCanonicalSegmentTexts,
  mergeOpeningTokensWithGuidedSteps,
} from './dialogTestPlanCanonicalScripts';
import { resolveCatalogTargetPath } from './dialogTestPlanResolvePath';
import {
  DIALOG_TEST_FAMILIES,
  type DialogTestPlan,
  type DialogTestVoice,
} from './dialogTestPlanTypes';

function buildVoice(
  row: Pick<RowSegmentation, 'sourceText' | 'path' | 'rowIndex'>,
  categories: readonly TokenCategory[],
  allItems: AgentBundle['corpusItems'],
  itemPaths: readonly string[],
): DialogTestVoice {
  const resolved = resolveCatalogTargetPath(row.path, itemPaths, categories);
  const catalogItem = allItems.find((i) => i.path === resolved.path) ?? null;
  const catalogItemFound = catalogItem != null && resolved.inCatalog;

  const guided = catalogItem
    ? buildGuidedPathToTarget(allItems, categories, resolved.path)
    : null;

  const segmentTokens = catalogItem
    ? buildCanonicalSegmentTexts(catalogItem, categories)
    : [];

  const canonicalTokens = guided?.reachable && guided.steps.length > 0
    ? mergeOpeningTokensWithGuidedSteps(
        guided.steps.map((s) => s.userText),
        segmentTokens,
      )
    : segmentTokens;

  const scripts = guided?.reachable || canonicalTokens.length > 0
    ? buildCanonicalDialogScripts(row.sourceText, canonicalTokens)
    : {
        minimal: { family: 'minimal' as const, userSteps: [] },
        intermediate: { family: 'intermediate' as const, userSteps: [] },
        complete: { family: 'complete' as const, userSteps: [] },
      };

  const hasSteps = DIALOG_TEST_FAMILIES.some((f) => scripts[f].userSteps.length > 0);

  const id = row.rowIndex >= 0 ? `row-${row.rowIndex}` : `path:${row.path}:${row.sourceText.trim()}`;

  return {
    id,
    sourceText: row.sourceText,
    targetPath: resolved.path,
    reachable: hasSteps,
    catalogItemFound,
    canonicalTokens,
    scripts,
  };
}

function corpusItemAsRows(item: AgentBundle['corpusItems'][number]): RowSegmentation[] {
  const parts = item.sourceText.split(/;\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) {
    return [{
      rowIndex: -1,
      sourceText: item.sourceText,
      path: item.path,
      unmatched: [],
    }];
  }
  return parts.map((sourceText, rowIndex) => ({
    rowIndex,
    sourceText,
    path: item.path,
    unmatched: [],
  }));
}

/** Generates one test voice per corpus row with three canonical script families. */
export function generateDialogTestPlan(
  bundle: AgentBundle,
  segmentationRows?: readonly RowSegmentation[],
): DialogTestPlan {
  const categories = bundle.dictionary.categories ?? [];
  const itemPaths = bundle.itemPaths.length > 0
    ? bundle.itemPaths
    : bundle.corpusItems.map((i) => i.path);

  const rowSources = segmentationRows?.length
    ? segmentationRows
    : bundle.corpusItems.flatMap(corpusItemAsRows);

  const voices = rowSources.map((row) =>
    buildVoice(row, categories, bundle.corpusItems, itemPaths),
  );

  return {
    voices,
    generatedAt: new Date().toISOString(),
  };
}
