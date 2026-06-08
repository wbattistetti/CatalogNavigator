/**
 * Tree utilities for slot-filling analysis rows (ordering, merge, validation).
 */
import type { AnalysisRow } from '../hooks/useAnalysis';

/** Normalizes a slot path for fuzzy matching (underscore ↔ space). */
export function normalizeSlotKey(slot: string): string {
  return slot.toLowerCase().replace(/_/g, ' ');
}

/** Normalizes user-edited path: trim, lowercase, clean segments. */
export function normalizeSlotPath(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .split('.')
    .map((s) => s.trim())
    .filter(Boolean)
    .join('.');
}

/** Indexes rows by exact and normalized slot path. */
export function indexRowsBySlot(rows: AnalysisRow[]): Map<string, AnalysisRow> {
  const map = new Map<string, AnalysisRow>();
  for (const row of rows) {
    map.set(row.slot_filling, row);
    map.set(normalizeSlotKey(row.slot_filling), row);
  }
  return map;
}

/** Looks up a row by exact or normalized slot path. */
export function getRowBySlot(rowsBySlot: Map<string, AnalysisRow>, slot: string): AnalysisRow | undefined {
  return rowsBySlot.get(slot) ?? rowsBySlot.get(normalizeSlotKey(slot));
}

/** Returns direct child slot paths of a parent within a slot list. */
export function getDirectChildSlots(slots: string[], parentSlot: string): string[] {
  const prefix = parentSlot ? `${parentSlot}.` : '';
  return slots.filter((s) => {
    if (parentSlot && !s.startsWith(prefix)) return false;
    if (!parentSlot) return !s.includes('.');
    const rest = s.slice(prefix.length);
    return rest.length > 0 && !rest.includes('.');
  });
}

/** True when the slot has no children in the given slot list. */
export function isLeafSlot(slots: string[], slot: string): boolean {
  return getDirectChildSlots(slots, slot).length === 0;
}

/** Collects a root slot and all its descendants from analysis rows. */
export function collectSubtreeSlots(rows: AnalysisRow[], rootSlot: string): string[] {
  return rows
    .filter((r) => r.slot_filling === rootSlot || r.slot_filling.startsWith(`${rootSlot}.`))
    .map((r) => r.slot_filling);
}

/** Sorts rows in tree order (parents before children). */
export function sortAnalysisRows(rows: AnalysisRow[]): AnalysisRow[] {
  const slots = sortSlotsTreeOrder(rows.map((r) => r.slot_filling));
  const bySlot = new Map(rows.map((r) => [r.slot_filling, r]));
  return slots.map((s) => {
    const row = bySlot.get(s);
    if (!row) throw new Error(`Riga mancante per slot "${s}"`);
    return row;
  });
}

function emptyTaxonomyRow(slot_filling: string): AnalysisRow {
  return {
    slot_filling,
    question: null,
    grammar: null,
    no_match_1: null,
    no_match_2: null,
    no_match_3: null,
    status: null,
  };
}

function clearNluFields(row: AnalysisRow): AnalysisRow {
  return {
    ...row,
    question: null,
    grammar: null,
    no_match_1: null,
    no_match_2: null,
    no_match_3: null,
    status: null,
  };
}

/**
 * Restructures a node path (add/remove `.` levels), updates descendants,
 * creates missing ancestors, and re-sorts the tree.
 */
export function restructureSlotPath(
  rows: AnalysisRow[],
  oldSlot: string,
  newPathRaw: string,
): AnalysisRow[] {
  const newSlot = normalizeSlotPath(newPathRaw);
  if (!newSlot) throw new Error('Path non valido');
  if (oldSlot === newSlot) return rows;

  if (rows.some((r) => r.slot_filling === newSlot && r.slot_filling !== oldSlot)) {
    throw new Error(`Il path "${newSlot}" esiste già`);
  }

  let updated = rows.map((r) => {
    if (r.slot_filling === oldSlot) {
      return clearNluFields({ ...r, slot_filling: newSlot });
    }
    if (r.slot_filling.startsWith(`${oldSlot}.`)) {
      return clearNluFields({
        ...r,
        slot_filling: newSlot + r.slot_filling.slice(oldSlot.length),
      });
    }
    return r;
  });

  const parts = newSlot.split('.');
  const slotSet = new Set(updated.map((r) => r.slot_filling));
  for (let i = 1; i < parts.length; i++) {
    const ancestor = parts.slice(0, i).join('.');
    if (!slotSet.has(ancestor)) {
      updated.push(emptyTaxonomyRow(ancestor));
      slotSet.add(ancestor);
    }
  }

  return sortAnalysisRows(updated);
}

/**
 * Replaces the subtree rooted at `rootSlot` with regened rows, preserving
 * tree order from the original rows array.
 */
export function mergeSubtreeRows(
  allRows: AnalysisRow[],
  regenedBySlot: Map<string, AnalysisRow>,
  rootSlot: string,
): AnalysisRow[] {
  const subtreeSet = new Set(
    allRows
      .filter((r) => r.slot_filling === rootSlot || r.slot_filling.startsWith(`${rootSlot}.`))
      .map((r) => r.slot_filling),
  );

  const orderedSubtree = allRows
    .filter((r) => subtreeSet.has(r.slot_filling))
    .map((r) => {
      const regened = getRowBySlot(regenedBySlot, r.slot_filling);
      if (!regened) throw new Error(`Rigenerazione incompleta: manca lo slot "${r.slot_filling}"`);
      return { ...regened, slot_filling: r.slot_filling, status: null as AnalysisRow['status'] };
    });

  const result: AnalysisRow[] = [];
  let inserted = false;
  for (const row of allRows) {
    if (subtreeSet.has(row.slot_filling)) {
      if (!inserted) {
        result.push(...orderedSubtree);
        inserted = true;
      }
    } else {
      result.push(row);
    }
  }
  return result;
}

/** Returns internal nodes that are missing required NLU fields. */
export function findInvalidInternalNodes(slots: string[], rows: AnalysisRow[]): string[] {
  const bySlot = indexRowsBySlot(rows);
  const invalid: string[] = [];
  for (const slot of slots) {
    if (isLeafSlot(slots, slot)) continue;
    const row = getRowBySlot(bySlot, slot);
    if (!row?.question?.trim()) invalid.push(slot);
  }
  return invalid;
}

/** True when at least one row has NLU content (agent phase completed). */
export function hasAgentContent(rows: AnalysisRow[]): boolean {
  return rows.some((r) => !!r.question?.trim());
}

/** Sorts slot paths parent-before-child, alphabetical per level. */
export function sortSlotsTreeOrder(slots: string[]): string[] {
  return [...slots].sort((a, b) => {
    const depthDiff = a.split('.').length - b.split('.').length;
    if (depthDiff !== 0) return depthDiff;
    return a.localeCompare(b);
  });
}

/** Describes which nodes require questions vs which are leaves. */
export function formatInternalNodesSection(slots: string[]): string {
  const internal = slots.filter((s) => !isLeafSlot(slots, s));
  const leaves = slots.filter((s) => isLeafSlot(slots, s));

  const internalLines = internal.map((slot) => {
    const children = getDirectChildSlots(slots, slot);
    return `- ${slot}\n  figli diretti: ${children.join(', ')}`;
  });

  const leafLines = leaves.map((s) => `- ${s}`);

  return (
    `NODI INTERNI (${internal.length}) — question, grammar, no_match OBBLIGATORI:\n` +
    `${internalLines.join('\n')}\n\n` +
    `FOGLIE (${leaves.length}) — question=null, grammar=null, no_match=null:\n` +
    `${leafLines.join('\n')}`
  );
}

/** Normalizes a compact dotted path (lowercase, clean segments). */
export function normalizeCompactPath(path: string): string {
  return path
    .trim()
    .toLowerCase()
    .split('.')
    .map((s) => s.trim())
    .filter(Boolean)
    .join('.');
}

/**
 * Expands compact leaf paths to a full tree by adding all ancestor prefixes.
 * Sort order: parents before children, alphabetical per depth.
 */
export function expandLeafPathsToTree(leafPaths: string[]): string[] {
  const allPaths = new Set<string>();
  for (const raw of leafPaths) {
    const normalized = normalizeCompactPath(raw);
    if (!normalized) continue;
    const parts = normalized.split('.');
    for (let depth = 1; depth <= parts.length; depth++) {
      allPaths.add(parts.slice(0, depth).join('.'));
    }
  }
  return sortSlotsTreeOrder([...allPaths]);
}

/** Returns only leaf paths from a full slot list. */
export function extractLeafPaths(slots: string[]): string[] {
  return slots.filter((s) => isLeafSlot(slots, s));
}

/** Builds a human-readable indented tree from flat slot paths. */
export function formatSlotTree(slots: string[]): string {
  const sorted = [...slots].sort((a, b) => a.localeCompare(b));
  return sorted
    .map((slot) => {
      const depth = slot.split('.').length - 1;
      return `${'  '.repeat(depth)}${slot}`;
    })
    .join('\n');
}
