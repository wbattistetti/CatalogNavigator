/**
 * Rule-based grammar generation from slot paths — instant, no API calls.
 */
import type { AnalysisRow, GrammarEntry } from '../hooks/useAnalysis';
import { ensureGrammarMapsToSelf } from './analyzeAiPostProcess';
import { groupNameFromSlotSegment, normalizeGrammarEntry, validateGrammarRegex } from './grammarNormalize';

const UNICODE_DASHES = /[\u2010\u2011\u2012\u2013\u2014\u2212]/g;

function lastSegment(slot: string): string {
  const parts = slot.split('.');
  return parts[parts.length - 1] ?? slot;
}

function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Adds simple Italian morphological variants for a segment label. */
function expandSegmentVariants(segment: string): string[] {
  const norm = segment.trim().replace(UNICODE_DASHES, '-');
  const out = new Set<string>();
  const add = (v: string) => {
    const t = v.trim();
    if (t) out.add(t);
  };

  add(norm);
  add(norm.replace(/-/g, ' '));
  add(norm.replace(/-/g, ''));

  if (norm.endsWith('a')) add(norm.slice(0, -1) + 'e');
  if (norm.endsWith('o')) add(norm.slice(0, -1) + 'i');
  if (norm.endsWith('e')) add(norm.slice(0, -1) + 'i');

  return [...out];
}

/** Builds synonym phrases for a full slot path (deeper nodes include parent context). */
function buildSynonymsForSlot(slot: string): string[] {
  const parts = slot.split('.').map((p) => p.trim().replace(UNICODE_DASHES, '-'));
  const segment = parts[parts.length - 1] ?? slot;
  const synonyms = new Set(expandSegmentVariants(segment));

  if (parts.length >= 2) {
    const tail = parts.slice(-2).join(' ');
    synonyms.add(tail);
    synonyms.add(tail.replace(/-/g, ' '));
  }
  if (parts.length >= 3) {
    const tail3 = parts.slice(-3).join(' ');
    synonyms.add(tail3.replace(/-/g, ' '));
  }

  return [...synonyms].sort((a, b) => b.length - a.length);
}

/** Builds a recognition grammar for one node from its path segments. */
export function buildTemplateGrammar(slot: string): GrammarEntry {
  const segment = lastSegment(slot);
  const groupName = groupNameFromSlotSegment(segment) || 'nodo';
  const synonymParts = buildSynonymsForSlot(slot).map(escapeRegexLiteral).filter(Boolean);
  const fallback = escapeRegexLiteral(segment.replace(UNICODE_DASHES, '-').trim());
  const synonyms = synonymParts.length > 0 ? synonymParts.join('|') : fallback;
  const entry = normalizeGrammarEntry({
    regex: `(?P<${groupName}>${synonyms})`,
    mappings: { [groupName]: slot },
  });
  const validation = validateGrammarRegex(entry.regex, entry.mappings);
  if (!validation.valid) {
    throw new Error(`Grammatica template non valida per ${slot}: ${validation.error ?? 'errore sconosciuto'}`);
  }
  return entry;
}

function isGrammarComplete(row: AnalysisRow): boolean {
  return !!(
    row.grammar?.regex?.trim()
    && row.grammar.mappings
    && Object.keys(row.grammar.mappings).length > 0
  );
}

/**
 * Applies template grammars to rows (incremental or full overwrite).
 * Returns new rows array with grammars filled.
 */
function shouldReplaceGrammar(row: AnalysisRow, overwriteExisting: boolean): boolean {
  if (overwriteExisting) return true;
  if (!isGrammarComplete(row)) return true;
  const validation = validateGrammarRegex(row.grammar!.regex, row.grammar!.mappings);
  return !validation.valid;
}

export function applyTemplateGrammars(
  rows: AnalysisRow[],
  overwriteExisting = false,
): AnalysisRow[] {
  return rows.map((row) => {
    if (!shouldReplaceGrammar(row, overwriteExisting)) return row;
    const grammar = buildTemplateGrammar(row.slot_filling);
    return ensureGrammarMapsToSelf({
      ...row,
      grammar,
      status: row.status ?? null,
    });
  });
}

/** True when every row has a template-applicable grammar slot. */
export function countMissingTemplateGrammars(rows: AnalysisRow[]): number {
  return rows.filter((r) => !isGrammarComplete(r)).length;
}

/** Applies templates only to rows whose slot is in targetSlots. */
export function applyTemplateGrammarsToSlots(
  rows: AnalysisRow[],
  targetSlots: string[],
  overwriteExisting = false,
): AnalysisRow[] {
  const targets = new Set(targetSlots);
  return rows.map((row) => {
    if (!targets.has(row.slot_filling)) return row;
    if (!shouldReplaceGrammar(row, overwriteExisting)) return row;
    const grammar = buildTemplateGrammar(row.slot_filling);
    return ensureGrammarMapsToSelf({ ...row, grammar, status: row.status ?? null });
  });
}
