/**
 * Compiles a runtime AgentBundle from editor state (preview or publish).
 * Catalog item paths come from live corpus segmentation (in-memory), not saved item_paths.
 */
import type { Analysis } from './analysisTypes';
import type {
  AgentBundle,
  AgentBundleCompileInput,
  BundleCorpusItem,
} from './agentBundleTypes';
import { compileConstraintsForPath } from './corpusItemCompile';
import {
  buildCorpusLeafDescriptionMap,
  resolveCorpusItemPaths,
  resolveCorpusSegmentationRows,
} from './corpusItemPaths';
import { corpusExtraAnnotationsFromStorage } from './corpusExtraAnnotations';
import { getPathOrderingCategories } from './pathCanonicalize';
import { normalizeCategoryOrders } from './dictionaryTree';
import type { CatalogSanityReport } from './catalogSanity';
import { analyzeCatalogSanity, catalogSanityWarnings } from './catalogSanity';
import { buildCorpusItemsFromPaths } from './slotExtract';
import { resolveReadableConfirmationForPath } from './readableCatalog';

function buildMetaWarnings(input: AgentBundleCompileInput): string[] {
  const warnings: string[] = [];
  if (input.dictionaryDirty) {
    warnings.push('Il dizionario contiene modifiche non salvate.');
  }
  if (input.analysisDirty) {
    warnings.push('L\'analisi contiene modifiche non salvate.');
  }
  return warnings;
}

function requireOntology(input: AgentBundleCompileInput): Analysis {
  if (!input.analysis) {
    throw new Error('Ontologia mancante: segmenta il corpus prima di compilare l\'agente.');
  }
  const hasPaths = (input.analysis.item_paths?.length ?? 0) > 0;
  if (!hasPaths && !input.descriptions.some((d) => d.trim().length > 0)) {
    throw new Error('Ontologia mancante: segmenta il corpus prima di compilare l\'agente.');
  }
  return input.analysis;
}

function requireCorpusDescriptions(input: AgentBundleCompileInput): string[] {
  const descriptions = input.descriptions
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (descriptions.length === 0) {
    throw new Error('Nessuna descrizione nel corpus: impossibile compilare l\'agente.');
  }
  return descriptions;
}

function resolveLeafSourceText(
  path: string,
  leafDescriptionMap: ReadonlyMap<string, string> | Record<string, string>,
): string {
  if (leafDescriptionMap instanceof Map) {
    return leafDescriptionMap.get(path) ?? path;
  }
  return leafDescriptionMap[path] ?? path;
}

/**
 * Builds the compiled agent bundle from live corpus segmentation (descriptions + dictionary).
 */
export function compileAgentBundle(input: AgentBundleCompileInput): AgentBundle {
  const ontology = requireOntology(input);
  const descriptions = requireCorpusDescriptions(input);
  const extraAnnotations = input.extraAnnotations
    ?? corpusExtraAnnotationsFromStorage(input.analysis?.corpus_extra_annotations);
  const segmentationInput = {
    descriptions,
    dictionary: input.dictionary,
    loadedRefs: input.loadedRefs,
    segmentExclusions: input.segmentExclusions,
    itemExclusions: input.itemExclusions,
    extraAnnotations,
  };
  const pathCategories = input.loadedRefs?.length
    ? getPathOrderingCategories(input.loadedRefs)
    : normalizeCategoryOrders(input.dictionary.categories ?? []);
  const compileWarnings = buildMetaWarnings(input);

  const itemPaths = resolveCorpusItemPaths(segmentationInput);
  if (itemPaths.length === 0) {
    throw new Error(
      'Nessuna prestazione valida nel corpus: verifica descrizioni e segmentazione.',
    );
  }

  const leafDescriptionMap = input.leafDescriptionMap
    ?? buildCorpusLeafDescriptionMap(segmentationInput);
  const segmentationRows = resolveCorpusSegmentationRows(segmentationInput);

  const baseCorpus = buildCorpusItemsFromPaths(itemPaths, pathCategories);
  const readableCatalog = ontology.readable_catalog ?? null;
  const corpusItems: BundleCorpusItem[] = baseCorpus.map((item) => {
    const sourceText = resolveLeafSourceText(item.path, leafDescriptionMap);
    return {
      ...item,
      sourceText,
      confirmationText: resolveReadableConfirmationForPath(
        item.path,
        segmentationRows,
        readableCatalog,
      ),
      constraints: compileConstraintsForPath(item.segments, item.path, compileWarnings),
    };
  });

  const catalogSanity = analyzeCatalogSanity(corpusItems, pathCategories);
  compileWarnings.push(...catalogSanityWarnings(catalogSanity));

  if (input.mode === 'published') {
    const hasBlockingDuplicates = catalogSanity.duplicates.length > 0;
    if (hasBlockingDuplicates) {
      throw new Error(
        `Pubblicazione bloccata: ${catalogSanity.duplicates.length} gruppo/i di item con segmentazione duplicata. ` +
        'Escludi le righe nel report integrità catalogo o correggi il dizionario.',
      );
    }
  }

  return {
    meta: {
      documentName: input.documentName,
      documentId: input.documentId ?? null,
      mode: input.mode ?? 'preview',
      version: '1.2',
      compiledAt: new Date().toISOString(),
      warnings: compileWarnings,
      catalogSanity,
    },
    dictionary: {
      descriptionColumn: input.dictionary.descriptionColumn,
      tokens: input.dictionary.tokens,
      categories: pathCategories,
    },
    analysis: ontology,
    ontology,
    corpusItems,
    itemPaths,
  };
}

/** Serializes bundle for Supabase storage or API preview payload. */
export function serializeAgentBundle(bundle: AgentBundle): string {
  return JSON.stringify(bundle, null, 2);
}
