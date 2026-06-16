/**
 * Compiles a runtime AgentBundle from editor state (preview or publish).
 * Runtime corpus/item paths come from saved ontology — descriptions are not re-segmented.
 */
import type { Analysis } from './analysisTypes';
import type {
  AgentBundle,
  AgentBundleCompileInput,
  BundleCorpusItem,
  BundleCorpusSegment,
  CompiledConstraint,
} from './agentBundleTypes';
import { parseAgeConstraintToken } from './ageConstraintParse';
import { normalizeCategoryOrders, type TokenCategory } from './dictionaryTree';
import { resolveItemPaths } from './itemPaths';
import { getPathOrderingCategories } from './pathCanonicalize';
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
      sourceToken: tokenText,
    };
  }

  warnings.push(
    `Vincolo non compilabile su ${path}: "${tokenText}" (categoria "${categoryName}")`,
  );
  return null;
}

function compileConstraintsForPath(
  segments: BundleCorpusSegment[],
  path: string,
  warnings: string[],
): CompiledConstraint[] {
  const out: CompiledConstraint[] = [];
  for (const seg of segments) {
    if (seg.categoryType !== 'vincolo') continue;
    const compiled = compileVincoloConstraint(seg.text, seg.categoryName, warnings, path);
    if (compiled) out.push(compiled);
  }
  return out;
}

function buildMetaWarnings(input: AgentBundleCompileInput): string[] {
  const warnings: string[] = [];
  if (input.dictionaryDirty) {
    warnings.push('Il dizionario contiene modifiche non salvate.');
  }
  if (input.analysisDirty) {
    warnings.push('L\'analisi contiene modifiche non salvate.');
  }
  if (input.pathsOutOfSync) {
    warnings.push('I path del corpus non coincidono con item_paths salvati.');
  }
  return warnings;
}

function requireOntology(input: AgentBundleCompileInput): Analysis {
  if (!input.analysis?.rows?.length) {
    throw new Error('Ontologia mancante: genera l\'albero prima di compilare l\'agente.');
  }
  if (!input.analysis.item_paths?.length) {
    throw new Error('Nessun item_paths nell\'ontologia: impossibile compilare l\'agente.');
  }
  return input.analysis;
}

function resolveLeafSourceText(
  path: string,
  leafDescriptionMap: AgentBundleCompileInput['leafDescriptionMap'],
): string {
  if (!leafDescriptionMap) return path;
  if (leafDescriptionMap instanceof Map) {
    return leafDescriptionMap.get(path) ?? path;
  }
  return leafDescriptionMap[path] ?? path;
}

/**
 * Builds the compiled agent bundle from saved ontology item_paths.
 * Corpus segments are derived from each path token (no description re-segmentation).
 */
export function compileAgentBundle(input: AgentBundleCompileInput): AgentBundle {
  const ontology = requireOntology(input);
  const pathCategories = input.loadedRefs?.length
    ? getPathOrderingCategories(input.loadedRefs)
    : normalizeCategoryOrders(input.dictionary.categories ?? []);
  const compileWarnings = buildMetaWarnings(input);

  const slots = ontology.rows.map((row) => row.slot_filling);
  const itemPaths = resolveItemPaths(slots, ontology.item_paths);

  if (itemPaths.length === 0) {
    throw new Error(
      'Nessuna prestazione valida nell\'ontologia: verifica item_paths e albero slot_filling.',
    );
  }

  const baseCorpus = buildCorpusItemsFromPaths(itemPaths, pathCategories);
  const corpusItems: BundleCorpusItem[] = baseCorpus.map((item) => ({
    ...item,
    sourceText: resolveLeafSourceText(item.path, input.leafDescriptionMap),
    constraints: compileConstraintsForPath(item.segments, item.path, compileWarnings),
  }));

  return {
    meta: {
      documentName: input.documentName,
      documentId: input.documentId ?? null,
      mode: input.mode ?? 'preview',
      version: '1.2',
      compiledAt: new Date().toISOString(),
      warnings: compileWarnings,
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
