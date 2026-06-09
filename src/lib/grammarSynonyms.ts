/**
 * Synonym lists for grammar editing: extract from regex, compile to GrammarEntry deterministically.
 */
import type { GrammarEntry } from '../hooks/useAnalysis';
import { getDirectChildSlots } from './analysisTree';
import {
  extractRawNamedGroupNames,
  groupNameFromSlotSegment,
  normalizeGrammarEntry,
  validateGrammarRegex,
} from './grammarNormalize';
import { isItemSlot, resolveItemPaths } from './itemPaths';
import { requiresInteractiveNode } from './nluQuestionRules';

const UNICODE_DASHES = /[\u2010\u2011\u2012\u2013\u2014\u2212]/g;

export interface GrammarEditorPanel {
  targetPath: string;
  label: string;
  isParent: boolean;
  synonyms: string[];
}

function lastSegment(slot: string): string {
  const parts = slot.split('.');
  return parts[parts.length - 1] ?? slot;
}

function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Normalizes and deduplicates synonym lines from user input. */
export function normalizeSynonymList(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of raw) {
    const t = line.trim().replace(UNICODE_DASHES, '-');
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** Parses textarea content: one non-empty line = one synonym; spaces inside a line are kept. */
export function parseSynonymText(text: string): string[] {
  return normalizeSynonymList(text.split(/\r?\n/));
}

/** Serializes synonym list back to textarea lines. */
export function formatSynonymText(synonyms: string[]): string {
  return synonyms.join('\n');
}

/** Adds simple Italian morphological variants for a segment label. */
export function expandSegmentVariants(segment: string): string[] {
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

/** Default recognition synonyms for a slot path. */
export function defaultSynonymsForSlot(slot: string): string[] {
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

  return [...synonyms];
}

/** Default answer synonyms for a parent-item panel (prefix ambiguity). */
function defaultParentAnswerSynonyms(): string[] {
  return ['semplice', 'solo', 'senza', 'no', 'base', 'solamente'];
}

function extractGroupBody(regex: string, groupName: string): string | null {
  const escaped = groupName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\(\\?<${escaped}>([^)]*)\\)`);
  const m = regex.match(re);
  return m?.[1] ?? null;
}

/** Splits a group body into literal alternatives (best-effort, no nested groups). */
function splitAlternatives(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of body) {
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if (ch === '|' && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function unescapeLiteral(token: string): string {
  return token
    .replace(/\\s/g, ' ')
    .replace(/\\-/g, '-')
    .replace(/\\\./g, '.')
    .replace(/\\(.)/g, '$1')
    .trim();
}

function isLikelyLiteral(token: string): boolean {
  const t = token.trim();
  if (!t || t.includes('(?') || t.includes('[') && t.includes(':')) return false;
  if (/^\\[dDwWsSbB]/.test(t)) return false;
  return true;
}

/** Extracts synonym literals mapped to a target path from an existing grammar. */
export function extractSynonymsForTarget(grammar: GrammarEntry, targetPath: string): string[] {
  const synonyms = new Set<string>();
  for (const [groupName, path] of Object.entries(grammar.mappings)) {
    if (path !== targetPath) continue;
    const body = extractGroupBody(grammar.regex, groupName);
    if (!body) continue;
    for (const alt of splitAlternatives(body)) {
      if (isLikelyLiteral(alt)) synonyms.add(unescapeLiteral(alt));
    }
  }
  return [...synonyms];
}

/** Extracts a flat synonym list when all mappings point to the same path (simple node). */
export function extractSimpleSynonyms(grammar: GrammarEntry, slot: string): string[] {
  const paths = new Set(Object.values(grammar.mappings));
  if (paths.size === 1 && paths.has(slot)) {
    const all: string[] = [];
    for (const groupName of extractRawNamedGroupNames(grammar.regex)) {
      const body = extractGroupBody(grammar.regex, groupName);
      if (!body) continue;
      for (const alt of splitAlternatives(body)) {
        if (isLikelyLiteral(alt)) all.push(unescapeLiteral(alt));
      }
    }
    return normalizeSynonymList(all);
  }
  return normalizeSynonymList(extractSynonymsForTarget(grammar, slot));
}

/** Builds empty editor panels for an interactive node (parent item + direct children). */
export function buildInteractivePanels(
  slot: string,
  slots: string[],
  itemPathsInput?: string[] | null,
): GrammarEditorPanel[] {
  const itemPaths = resolveItemPaths(slots, itemPathsInput);
  const panels: GrammarEditorPanel[] = [];
  const children = getDirectChildSlots(slots, slot);

  if (isItemSlot(slot, itemPaths)) {
    panels.push({
      targetPath: slot,
      label: `Padre · ${lastSegment(slot)}`,
      isParent: true,
      synonyms: [],
    });
  }

  for (const child of children) {
    panels.push({
      targetPath: child,
      label: lastSegment(child),
      isParent: false,
      synonyms: [],
    });
  }

  return panels;
}

/** Merges extracted synonyms into panel definitions. */
export function hydratePanelsFromGrammar(
  panels: GrammarEditorPanel[],
  grammar: GrammarEntry | null,
): GrammarEditorPanel[] {
  if (!grammar?.regex?.trim()) return panels;
  return panels.map((panel) => {
    const extracted = extractSynonymsForTarget(grammar, panel.targetPath);
    return {
      ...panel,
      synonyms: extracted.length > 0 ? extracted : panel.synonyms,
    };
  });
}

/** Seeds default synonyms when grammar is missing or empty. */
export function seedDefaultPanels(
  panels: GrammarEditorPanel[],
  slot: string,
): GrammarEditorPanel[] {
  return panels.map((panel) => {
    if (panel.synonyms.length > 0) return panel;
    if (panel.isParent) {
      const base = defaultSynonymsForSlot(slot);
      const answers = defaultParentAnswerSynonyms();
      return { ...panel, synonyms: normalizeSynonymList([...base, ...answers]) };
    }
    return { ...panel, synonyms: defaultSynonymsForSlot(panel.targetPath) };
  });
}

export function seedDefaultSimpleSynonyms(slot: string): string[] {
  return defaultSynonymsForSlot(slot);
}

export type GrammarEditorMode = 'node' | 'answer';

/** True when the node uses the multi-panel answer grammar editor. */
export function usesAnswerGrammarEditor(
  slot: string,
  slots: string[],
  itemPathsInput?: string[] | null,
): boolean {
  return requiresInteractiveNode(slots, slot, itemPathsInput);
}

/** @deprecated Use usesAnswerGrammarEditor — node editor is always simple. */
export function usesInteractiveGrammarEditor(
  slot: string,
  slots: string[],
  itemPathsInput?: string[] | null,
): boolean {
  return usesAnswerGrammarEditor(slot, slots, itemPathsInput);
}

/** Compiles a simple-node grammar from a flat synonym list. */
export function compileSimpleGrammar(slot: string, synonyms: string[]): GrammarEntry {
  const cleaned = normalizeSynonymList(synonyms);
  if (cleaned.length === 0) {
    throw new Error('Inserisci almeno un sinonimo');
  }
  const groupName = groupNameFromSlotSegment(lastSegment(slot)) || 'nodo';
  const regex = `(?<${groupName}>${cleaned.map(escapeRegexLiteral).join('|')})`;
  const entry = normalizeGrammarEntry({
    regex,
    mappings: { [groupName]: slot },
  });
  const validation = validateGrammarRegex(entry.regex, entry.mappings);
  if (!validation.valid) {
    throw new Error(validation.error ?? 'Grammatica non valida');
  }
  return entry;
}

/** Compiles question-routing grammar from per-target synonym panels. */
export function compileInteractiveGrammar(panels: GrammarEditorPanel[]): GrammarEntry {
  const parts: string[] = [];
  const mappings: Record<string, string> = {};
  const usedNames = new Set<string>();

  for (const panel of panels) {
    const cleaned = normalizeSynonymList(panel.synonyms);
    if (cleaned.length === 0) continue;

    let baseName = panel.isParent
      ? 'padre'
      : groupNameFromSlotSegment(lastSegment(panel.targetPath)) || 'figlio';
    let groupName = baseName;
    let suffix = 0;
    while (usedNames.has(groupName)) {
      groupName = `${baseName}_${suffix}`;
      suffix += 1;
    }
    usedNames.add(groupName);

    parts.push(`(?<${groupName}>${cleaned.map(escapeRegexLiteral).join('|')})`);
    mappings[groupName] = panel.targetPath;
  }

  if (parts.length === 0) {
    throw new Error('Inserisci almeno un sinonimo in un pannello');
  }

  const entry = normalizeGrammarEntry({ regex: parts.join('|'), mappings });
  const validation = validateGrammarRegex(entry.regex, entry.mappings);
  if (!validation.valid) {
    throw new Error(validation.error ?? 'Grammatica non valida');
  }
  return entry;
}

/** Builds initial editor state from slot + grammar for node or answer mode. */
export function buildGrammarEditorState(
  slot: string,
  slots: string[],
  itemPathsInput: string[] | null | undefined,
  grammar: GrammarEntry | null,
  mode: GrammarEditorMode = 'node',
): { interactive: boolean; panels: GrammarEditorPanel[]; simpleSynonyms: string[] } {
  if (mode === 'answer' && usesAnswerGrammarEditor(slot, slots, itemPathsInput)) {
    let panels = buildInteractivePanels(slot, slots, itemPathsInput);
    panels = hydratePanelsFromGrammar(panels, grammar);
    panels = seedDefaultPanels(panels, slot);
    return { interactive: true, panels, simpleSynonyms: [] };
  }

  let simpleSynonyms = grammar?.regex?.trim()
    ? extractSimpleSynonyms(grammar, slot)
    : seedDefaultSimpleSynonyms(slot);
  if (simpleSynonyms.length === 0) {
    simpleSynonyms = seedDefaultSimpleSynonyms(slot);
  }
  return { interactive: false, panels: [], simpleSynonyms };
}

/** Compiles editor state back to GrammarEntry. */
export function compileGrammarFromEditorState(
  slot: string,
  mode: GrammarEditorMode,
  panels: GrammarEditorPanel[],
  simpleSynonyms: string[],
): GrammarEntry {
  if (mode === 'answer') {
    return compileInteractiveGrammar(panels);
  }
  return compileSimpleGrammar(slot, simpleSynonyms);
}
