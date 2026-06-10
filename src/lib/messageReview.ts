/**
 * Per-field message review metadata: validation status and content source (deterministic / IA / manual).
 */
import type {
  AnalysisRow,
  MessageFieldMeta,
  MessageFieldMetaMap,
  MessageReviewField,
  MessageSource,
  RowStatus,
} from './analysisTypes';
import { getInteractiveMessageSlots } from './analysisTree';
import { isTerminalItemSlot, resolveItemPaths } from './itemPaths';

export type {
  MessageReviewField,
  MessageSource,
  MessageFieldMeta,
  MessageFieldMetaMap,
} from './analysisTypes';

export const INTERACTIVE_MESSAGE_FIELDS: MessageReviewField[] = [
  'question',
  'no_match_1',
  'no_match_2',
  'no_match_3',
];

export interface MessageReviewStats {
  total: number;
  validated: number;
  pending: number;
  rejected: number;
  uncertain: number;
  validatedPct: number;
}

function messageFieldValue(row: AnalysisRow, field: MessageReviewField): string | null {
  switch (field) {
    case 'question': return row.question;
    case 'no_match_1': return row.no_match_1;
    case 'no_match_2': return row.no_match_2;
    case 'no_match_3': return row.no_match_3;
    case 'confirmation_text': return row.confirmation_text;
  }
}

/** Returns review metadata for a field, migrating legacy row.status on question. */
export function getFieldMeta(row: AnalysisRow, field: MessageReviewField): MessageFieldMeta {
  const stored = row.field_meta?.[field];
  if (field === 'question' && row.status && !stored?.status) {
    return { ...stored, status: row.status };
  }
  return stored ?? {};
}

function reviewFieldsForRow(
  row: AnalysisRow,
  interactiveSlots: Set<string>,
  itemPaths: string[],
): MessageReviewField[] {
  const slot = row.slot_filling;
  const fields: MessageReviewField[] = [];
  if (interactiveSlots.has(slot)) {
    fields.push(...INTERACTIVE_MESSAGE_FIELDS);
  }
  if (isTerminalItemSlot(slot, itemPaths) && row.confirmation_text?.trim()) {
    fields.push('confirmation_text');
  }
  return fields;
}

/** Counts reviewable message cells and validation progress. */
export function computeMessageReviewStats(
  rows: AnalysisRow[],
  itemPathsInput?: string[] | null,
): MessageReviewStats {
  const slots = rows.map((r) => r.slot_filling);
  const itemPaths = resolveItemPaths(slots, itemPathsInput);
  const interactiveSlots = new Set(getInteractiveMessageSlots(slots, itemPaths));

  let total = 0;
  let validated = 0;
  let rejected = 0;
  let uncertain = 0;

  for (const row of rows) {
    for (const field of reviewFieldsForRow(row, interactiveSlots, itemPaths)) {
      if (!messageFieldValue(row, field)?.trim()) continue;
      total += 1;
      const status = getFieldMeta(row, field).status ?? null;
      if (status === 'approved') validated += 1;
      else if (status === 'rejected') rejected += 1;
      else if (status === 'uncertain') uncertain += 1;
    }
  }

  const pending = total - validated - rejected - uncertain;
  return {
    total,
    validated,
    pending,
    rejected,
    uncertain,
    validatedPct: total > 0 ? Math.round((validated / total) * 100) : 0,
  };
}

function mergeFieldMeta(
  row: AnalysisRow,
  field: MessageReviewField,
  patch: Partial<MessageFieldMeta>,
): MessageFieldMetaMap {
  const prev = getFieldMeta(row, field);
  return { ...row.field_meta, [field]: { ...prev, ...patch } };
}

/** Applies validation or source changes to one message field. */
export function buildRowFieldStatusUpdate(
  row: AnalysisRow,
  field: MessageReviewField,
  status: RowStatus,
): Partial<AnalysisRow> {
  const field_meta = mergeFieldMeta(row, field, { status: status ?? undefined });
  if (field === 'question') {
    return { field_meta, status };
  }
  return { field_meta };
}

/** Marks a field as manually edited and clears its validation. */
export function buildRowFieldEditUpdate(
  row: AnalysisRow,
  field: MessageReviewField,
  value: string | null,
): Partial<AnalysisRow> {
  const field_meta = mergeFieldMeta(row, field, { status: undefined, source: 'manual' });
  const patch: Partial<AnalysisRow> = { field_meta, [field]: value };
  if (field === 'question') {
    patch.status = null;
  }
  return patch;
}

function stampRowFields(
  row: AnalysisRow,
  fields: MessageReviewField[],
  source: MessageSource,
  resetValidation: boolean,
): AnalysisRow {
  let field_meta: MessageFieldMetaMap = { ...row.field_meta };
  for (const field of fields) {
    const prev = getFieldMeta(row, field);
    field_meta = {
      ...field_meta,
      [field]: {
        ...prev,
        source,
        ...(resetValidation ? { status: undefined } : {}),
      },
    };
  }
  const next: AnalysisRow = { ...row, field_meta };
  if (resetValidation && fields.includes('question')) {
    next.status = null;
  }
  return next;
}

/** Stamps deterministic source on all interactive message fields. */
export function stampDeterministicMessageLayer(
  rows: AnalysisRow[],
  itemPathsInput?: string[] | null,
): AnalysisRow[] {
  const slots = rows.map((r) => r.slot_filling);
  const itemPaths = resolveItemPaths(slots, itemPathsInput);
  const interactiveSlots = new Set(getInteractiveMessageSlots(slots, itemPaths));
  return rows.map((row) => {
    if (!interactiveSlots.has(row.slot_filling)) return row;
    return stampRowFields(row, INTERACTIVE_MESSAGE_FIELDS, 'deterministic', true);
  });
}

/** Stamps IA source and clears validation for interactive rows in a subtree. */
export function stampAiMessageSubtree(
  rows: AnalysisRow[],
  rootSlot: string,
  itemPathsInput?: string[] | null,
): AnalysisRow[] {
  const slots = rows.map((r) => r.slot_filling);
  const itemPaths = resolveItemPaths(slots, itemPathsInput);
  const interactiveSlots = new Set(getInteractiveMessageSlots(slots, itemPaths));
  const prefix = `${rootSlot}.`;
  return rows.map((row) => {
    const inSubtree = row.slot_filling === rootSlot || row.slot_filling.startsWith(prefix);
    if (!inSubtree || !interactiveSlots.has(row.slot_filling)) return row;
    return stampRowFields(row, INTERACTIVE_MESSAGE_FIELDS, 'ai', true);
  });
}
