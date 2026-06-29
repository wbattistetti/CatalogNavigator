/**
 * Builds compile input for the disambiguation plan without blocking the UI on live re-segmentation.
 */
import { normalizeConfirmationPreamble } from './confirmationPrompts';
import type { AgentBundleCompileInput } from './agentBundleTypes';
import type { CompileDisambiguationPlanInput } from './compileDisambiguationPlan';
import { compileAgentBundle } from './compileAgentBundle';
import {
  buildCorpusSegmentationInputFromLoadedRefs,
  resolveCorpusItemPathsFromSegmentationCache,
  resolveCorpusItemPathsFromSegmentationCacheAsync,
  type CorpusSegmentationInput,
} from './corpusItemPaths';
import type { CorpusSegmentationEntry } from './corpusSegmentationCache';
import { lookupCorpusSegmentation, yieldToMainThread } from './corpusSegmentationCache';
import { getPathOrderingCategories } from './pathCanonicalize';
import { normalizeCategoryOrders } from './dictionaryTree';
import { buildCorpusItemsWithConstraints } from './corpusItemCompile';

export interface BuildDisambiguationPreparingProgress {
  phase: 'paths' | 'corpus_items';
  processed: number;
  total: number;
}

export interface BuildDisambiguationPlanCompileInputOptions {
  pathsOutOfSync?: boolean;
  segmentationCache?: ReadonlyMap<string, CorpusSegmentationEntry>;
  onPreparing?: (progress: BuildDisambiguationPreparingProgress) => void;
}

/** Minimal analysis shell for disambiguation compute — avoids building the full taxonomy tree. */
export function createAnalysisWithItemPathsForCompute(
  documentId: string,
  itemPaths: string[],
  existing?: Analysis | null,
): Analysis {
  const now = new Date().toISOString();
  return {
    id: existing?.id ?? '',
    document_id: documentId,
    rows: existing?.rows ?? [],
    item_paths: itemPaths,
    start_question: existing?.start_question ?? null,
    confirmation_preamble: normalizeConfirmationPreamble(existing?.confirmation_preamble),
    disambiguation_plan: existing?.disambiguation_plan ?? null,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
}

function resolveSegmentationInput(input: AgentBundleCompileInput): CorpusSegmentationInput {
  const descriptions = input.descriptions
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (input.loadedRefs?.length) {
    return buildCorpusSegmentationInputFromLoadedRefs(
      descriptions,
      input.loadedRefs,
      input.segmentExclusions,
      input.itemExclusions,
      input.extraAnnotations,
    );
  }

  return {
    descriptions,
    dictionary: input.dictionary,
    segmentExclusions: input.segmentExclusions,
    itemExclusions: input.itemExclusions,
    extraAnnotations: input.extraAnnotations,
  };
}

function resolveCategories(input: AgentBundleCompileInput) {
  return input.loadedRefs?.length
    ? getPathOrderingCategories(input.loadedRefs)
    : normalizeCategoryOrders(input.dictionary.categories ?? []);
}

async function buildCorpusItemsAsync(
  itemPaths: string[],
  categories: ReturnType<typeof resolveCategories>,
  onPreparing?: (progress: BuildDisambiguationPreparingProgress) => void,
): Promise<CompileDisambiguationPlanInput['corpusItems']> {
  const BATCH = 400;
  const total = itemPaths.length;
  if (total <= BATCH) {
    onPreparing?.({ phase: 'corpus_items', processed: total, total });
    return buildCorpusItemsWithConstraints(itemPaths, categories);
  }

  const items: NonNullable<CompileDisambiguationPlanInput['corpusItems']> = [];
  for (let i = 0; i < itemPaths.length; i += BATCH) {
    items.push(...buildCorpusItemsWithConstraints(itemPaths.slice(i, i + BATCH), categories));
    onPreparing?.({ phase: 'corpus_items', processed: Math.min(i + BATCH, total), total });
    await yieldToMainThread();
  }
  return items;
}

/**
 * Prefer saved ontology paths or the warmed segmentation cache; fall back to live compile only when needed.
 */
export async function buildDisambiguationPlanCompileInputAsync(
  input: AgentBundleCompileInput,
  options?: BuildDisambiguationPlanCompileInputOptions,
): Promise<CompileDisambiguationPlanInput> {
  if (!input.analysis) {
    throw new Error('Analisi non caricata: riapri il documento e riprova.');
  }

  await yieldToMainThread();

  const categories = resolveCategories(input);
  const segmentationInput = resolveSegmentationInput(input);
  const cachedPaths = options?.pathsOutOfSync
    ? null
    : input.analysis.item_paths?.map((p) => p.trim()).filter(Boolean);

  if (cachedPaths && cachedPaths.length > 0) {
    return {
      itemPaths: cachedPaths,
      categories,
      corpusItems: await buildCorpusItemsAsync(cachedPaths, categories, options?.onPreparing),
    };
  }

  const cache = options?.segmentationCache;
  if (cache && cache.size > 0) {
    await yieldToMainThread();
    const itemPaths = await resolveCorpusItemPathsFromSegmentationCacheAsync(
      segmentationInput,
      cache,
      (processed, total) => options?.onPreparing?.({ phase: 'paths', processed, total }),
    );
    if (itemPaths.length > 0) {
      return {
        itemPaths,
        categories,
        corpusItems: await buildCorpusItemsAsync(itemPaths, categories, options?.onPreparing),
      };
    }
  }

  throw new Error(
    'Nessun path catalogo disponibile dalla segmentazione corpus. ' +
    'Completa «Crea ontologia» in alto e riprova.',
  );
}

/** True when disambiguation plan can be built without live re-segmentation. */
export function canResolveDisambiguationCatalog(
  analysis: { rows?: unknown[]; item_paths?: string[] | null } | null | undefined,
  pathsOutOfSync: boolean,
  segmentationCache?: ReadonlyMap<string, CorpusSegmentationEntry>,
  descriptions?: string[],
): boolean {
  if (!pathsOutOfSync) {
    const savedPaths = analysis?.item_paths?.filter((p) => p.trim()).length ?? 0;
    if (savedPaths > 0) return true;
  }
  if ((analysis?.rows?.length ?? 0) > 0) return true;
  if (!segmentationCache || segmentationCache.size === 0) return false;
  for (const entry of segmentationCache.values()) {
    if (entry?.path?.trim()) return true;
  }
  if (!descriptions) return false;
  for (const line of descriptions) {
    const text = line.trim();
    if (!text) continue;
    const entry = lookupCorpusSegmentation(segmentationCache, text);
    if (entry?.path?.trim()) return true;
  }
  return false;
}

/** User-facing hint when Calcola is blocked. */
export function resolveDisambiguationComputeBlockReason(
  analysis: { rows?: unknown[]; item_paths?: string[] | null } | null | undefined,
  dictionary: { categories?: unknown[] } | null | undefined,
  descriptions: string[],
  pathsOutOfSync: boolean,
  segmentationCache?: ReadonlyMap<string, CorpusSegmentationEntry>,
): string | null {
  if (!descriptions.some((line) => line.trim().length > 0)) {
    return 'Nessuna descrizione nel corpus: verifica le colonne ontologia del documento.';
  }
  if (!dictionary?.categories?.length) {
    return 'Monta un dizionario con categorie nel progetto (tab Dizionari) prima di calcolare il piano.';
  }
  if (canResolveDisambiguationCatalog(analysis, pathsOutOfSync, segmentationCache, descriptions)) {
    return null;
  }
  const hasSegmentation = segmentationCache && segmentationCache.size > 0;
  if (hasSegmentation) {
    return 'Segmentazione corpus presente ma nessun path catalogo valido: verifica le colonne ontologia e i dizionari montati.';
  }
  return 'Genera la segmentazione corpus e clicca «Crea ontologia» nella barra in alto, poi «Calcola» qui.';
}

/** Fast catalog size for UI hints — never re-segments the full corpus synchronously. */
export function resolveDisambiguationCatalogCount(
  analysisItemPaths: string[] | null | undefined,
  pathsOutOfSync: boolean,
  segmentationCache?: ReadonlyMap<string, CorpusSegmentationEntry>,
  fallbackDescriptions?: string[],
): number {
  if (!pathsOutOfSync) {
    const cached = analysisItemPaths?.length ?? 0;
    if (cached > 0) return cached;
  }
  if (segmentationCache && segmentationCache.size > 0 && fallbackDescriptions) {
    let count = 0;
    for (const line of fallbackDescriptions) {
      const text = line.trim();
      if (!text) continue;
      if (lookupCorpusSegmentation(segmentationCache, text)) count += 1;
    }
    if (count > 0) return count;
  }
  return analysisItemPaths?.length ?? 0;
}

/** @deprecated Prefer buildDisambiguationPlanCompileInputAsync — sync path re-segments the corpus. */
export function buildDisambiguationPlanCompileInput(
  input: AgentBundleCompileInput,
  options?: BuildDisambiguationPlanCompileInputOptions,
): CompileDisambiguationPlanInput {
  const categories = resolveCategories(input);
  const cachedPaths = options?.pathsOutOfSync
    ? null
    : input.analysis?.item_paths?.map((p) => p.trim()).filter(Boolean);

  if (cachedPaths && cachedPaths.length > 0) {
    return {
      itemPaths: cachedPaths,
      categories,
      corpusItems: buildCorpusItemsWithConstraints(cachedPaths, categories),
    };
  }

  const segmentationInput = resolveSegmentationInput(input);
  const cache = options?.segmentationCache;
  if (cache && cache.size > 0) {
    const itemPaths = resolveCorpusItemPathsFromSegmentationCache(segmentationInput, cache);
    if (itemPaths.length > 0) {
      return {
        itemPaths,
        categories,
        corpusItems: buildCorpusItemsWithConstraints(itemPaths, categories),
      };
    }
  }

  const bundle = compileAgentBundle(input);
  return {
    itemPaths: bundle.itemPaths,
    categories: bundle.dictionary.categories,
    corpusItems: bundle.corpusItems,
  };
}
