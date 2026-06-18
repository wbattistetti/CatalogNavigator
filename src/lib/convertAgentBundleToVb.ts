/**
 * Converts TypeScript AgentBundle (corpusItems) to VB DialogEngine JSON (catalog + ontology).
 */
import type {
  AgentBundle,
  AgentConcept,
  AgentSessionState,
  CompiledAgeConstraint,
  ConceptKind,
  ExpectedSlotValueKind,
  PendingSlotContract,
} from './agentBundleTypes';
import { normalizeCategoryOrders } from './dictionaryTree';
import { compileVincoloResolutionPipeline } from './vincoloResolutionPipeline';

function canonicalConceptValue(value: string): string {
  return value.trim().toLowerCase();
}

/** Maps a value to dictionary token text when it matches allowedValues. */
function resolveCatalogValue(
  value: string,
  allowedValues: readonly string[],
  kind: ConceptKind,
): string {
  const trimmed = value.trim();
  if (kind === 'vincolo') return trimmed;
  const normalized = canonicalConceptValue(trimmed);
  const match = allowedValues.find((allowed) => canonicalConceptValue(allowed) === normalized);
  return match ?? trimmed;
}

export interface VbCatalogConcept {
  category: string;
  value: string;
  kind: ConceptKind;
}

export interface VbCatalogItem {
  path: string;
  concepts: VbCatalogConcept[];
  ageConstraints: Array<{ categoryName: string; min: number | null; max: number | null }>;
}

export interface VbAgentBundlePayload {
  meta: AgentBundle['meta'];
  ontology: {
    id?: string;
    documentId?: string | null;
    startQuestion: string | null;
    confirmationPreamble: string | null;
    categories: Array<{
      id: string;
      name: string;
      order: number;
      kind: ConceptKind;
      allowedValues: string[];
      valueKind?: string | null;
      grammar?: { regex: string; mappings: Record<string, string> } | null;
      resolution?: Record<string, unknown> | null;
    }>;
    nodes: Array<{ path: string; confirmationText: string | null }>;
  };
  catalog: {
    items: VbCatalogItem[];
  };
}

/** Maps editor bundle → VB-native bundle JSON for DialogEngine.Api. */
export function convertAgentBundleToVb(bundle: AgentBundle): VbAgentBundlePayload {
  const analysis = bundle.ontology ?? bundle.analysis;
  const categories = normalizeCategoryOrders(bundle.dictionary.categories ?? []);
  const rowBySlot = new Map(analysis.rows.map((row) => [row.slot_filling, row]));

  const confirmationForPath = (path: string): string | null => {
    const direct = rowBySlot.get(path)?.confirmation_text?.trim();
    if (direct) return direct;
    let best: string | null = null;
    let bestLen = -1;
    for (const row of analysis.rows) {
      const text = row.confirmation_text?.trim();
      if (!text) continue;
      if (path === row.slot_filling || path.startsWith(`${row.slot_filling}.`)) {
        if (row.slot_filling.length > bestLen) {
          bestLen = row.slot_filling.length;
          best = text;
        }
      }
    }
    return best;
  };

  const vbCategories = categories.map((cat) => {
    const isVincolo = cat.type === 'vincolo';
    const kind: ConceptKind = isVincolo ? 'vincolo' : 'attributo';
    const allowedValues = [...(cat.tokenTexts ?? [])];
    const valueKind = cat.valueKind === 'age_years' ? 'age_years' : null;
    const resolution = isVincolo && valueKind === 'age_years'
      ? (cat.resolution ?? compileVincoloResolutionPipeline(cat))
      : null;
    const grammarMappings = cat.grammar?.mappings
      ? Object.fromEntries(
        Object.entries(cat.grammar.mappings).map(([key, mapped]) => [
          key,
          resolveCatalogValue(mapped, allowedValues, kind),
        ]),
      )
      : undefined;
    return {
      id: cat.id,
      name: cat.name,
      order: cat.order,
      kind,
      allowedValues,
      valueKind,
      grammar: cat.grammar?.regex?.trim()
        ? { regex: cat.grammar.regex, mappings: grammarMappings ?? {} }
        : undefined,
      resolution: resolution ?? undefined,
    };
  });

  const categoryByName = new Map(vbCategories.map((cat) => [cat.name, cat]));

  const nodes = bundle.itemPaths.flatMap((path) => {
    const confirmationText = confirmationForPath(path);
    if (!confirmationText) return [];
    return [{ path, confirmationText }];
  });

  const catalogItems: VbCatalogItem[] = bundle.corpusItems.map((item) => ({
    path: item.path,
    concepts: item.segments
      .filter((seg) => seg.categoryName.trim())
      .map((seg) => {
        const category = categoryByName.get(seg.categoryName);
        const kind: ConceptKind = seg.categoryType === 'vincolo' ? 'vincolo' : 'attributo';
        return {
          category: seg.categoryName,
          value: resolveCatalogValue(seg.text, category?.allowedValues ?? [], kind),
          kind,
        };
      }),
    ageConstraints: item.constraints
      .filter((c): c is CompiledAgeConstraint => c.kind === 'age_years')
      .map((c) => ({
        categoryName: c.categoryName,
        min: c.min,
        max: c.max,
      })),
  }));

  return {
    meta: { ...bundle.meta },
    ontology: {
      id: analysis.id,
      documentId: analysis.document_id ?? bundle.meta.documentId,
      startQuestion: analysis.start_question,
      confirmationPreamble: analysis.confirmation_preamble,
      categories: vbCategories,
      nodes,
    },
    catalog: { items: catalogItems },
  };
}

function isExpectedSlotValueKind(value: string): value is ExpectedSlotValueKind {
  return value === 'age_years' || value === 'canonical_token';
}

/** Maps VB ExpectedConstraint JSON → TS pendingExpectedInput. */
function convertPendingConstraintFromVb(raw: unknown): PendingSlotContract[] | null {
  if (!raw || typeof raw !== 'object') return null;
  const constraint = raw as Record<string, unknown>;
  const categoryName = typeof constraint.categoryName === 'string' ? constraint.categoryName.trim() : '';
  const valueKindRaw = typeof constraint.valueKind === 'string' ? constraint.valueKind.trim() : '';
  const description = typeof constraint.description === 'string' ? constraint.description : '';
  if (!categoryName || !isExpectedSlotValueKind(valueKindRaw)) return null;
  return [{ categoryName, valueKind: valueKindRaw, description }];
}

/** Maps TS pendingExpectedInput → VB PendingConstraint shape. */
function convertPendingConstraintToVb(
  pendingExpectedInput: PendingSlotContract[] | null | undefined,
): Record<string, string> | null {
  const pending = pendingExpectedInput?.[0];
  if (!pending?.categoryName?.trim() || !pending.valueKind) return null;
  return {
    categoryName: pending.categoryName.trim(),
    valueKind: pending.valueKind,
    description: pending.description ?? '',
  };
}

/** Maps TS session state → VB session JSON. */
export function convertSessionStateToVb(
  state: AgentSessionState | null,
): Record<string, unknown> | null {
  if (!state) return null;
  return {
    acquiredConcepts: state.acquiredConcepts ?? [],
    selectedPath: state.selectedPath,
    noMatchCount: state.noMatchCount,
    lastTranscript: state.lastTranscript,
    pendingConstraint: convertPendingConstraintToVb(state.pendingExpectedInput),
  };
}

function conceptsFromLegacyDict(dict: Record<string, string>): AgentConcept[] {
  return Object.entries(dict).map(([category, value]) => ({
    category,
    value,
    kind: category.toLowerCase().includes('fascia') || category.toLowerCase().includes('et')
      ? 'vincolo' as const
      : 'attributo' as const,
  }));
}

/** Maps VB session JSON back to TS AgentSessionState. */
export function convertSessionStateFromVb(raw: unknown): AgentSessionState | null {
  if (!raw || typeof raw !== 'object') return null;
  const state = raw as Record<string, unknown>;

  let acquiredConcepts: AgentConcept[] = [];
  if (Array.isArray(state.acquiredConcepts)) {
    acquiredConcepts = state.acquiredConcepts
      .filter((c): c is Record<string, unknown> => typeof c === 'object' && c != null)
      .map((c) => ({
        category: String(c.category ?? c.categoryName ?? '').trim(),
        value: String(c.value ?? '').trim(),
        kind: c.kind === 'vincolo' ? 'vincolo' as const : c.kind === 'attributo' ? 'attributo' as const : undefined,
        unit: typeof c.unit === 'string' ? c.unit : undefined,
      }))
      .filter((c) => c.category && c.value);
  } else {
    const legacy = state.resolvedConcepts ?? state.resolvedSlots;
    if (legacy && typeof legacy === 'object') {
      acquiredConcepts = conceptsFromLegacyDict(legacy as Record<string, string>);
    }
  }

  return {
    acquiredConcepts,
    selectedPath: typeof state.selectedPath === 'string' ? state.selectedPath : null,
    noMatchCount: typeof state.noMatchCount === 'number' ? state.noMatchCount : 0,
    lastTranscript: typeof state.lastTranscript === 'string' ? state.lastTranscript : undefined,
    pendingExpectedInput: convertPendingConstraintFromVb(state.pendingConstraint),
  };
}
