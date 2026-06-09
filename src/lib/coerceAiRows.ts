/**
 * Parses and coerces OpenAI JSON into the rows array for NLU post-processing.
 */
import { sanitizeOpenAiJsonRegex } from './grammarNormalize';

function isGrammarEntryLike(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const g = value as Record<string, unknown>;
  return typeof g.regex === 'string' && g.mappings != null && typeof g.mappings === 'object';
}

function isRowLike(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.slot_filling === 'string'
    || typeof row.slot === 'string'
    || typeof row.path === 'string'
    || typeof row.question === 'string'
    || row.grammar != null
    || typeof row.no_match_1 === 'string'
    || typeof row.no_match_2 === 'string'
    || typeof row.no_match_3 === 'string'
  );
}

function isKeyedGrammarMap(obj: Record<string, unknown>): boolean {
  const entries = Object.entries(obj);
  if (entries.length === 0) return false;
  return entries.every(([, value]) => isGrammarEntryLike(value));
}

function grammarMapToRows(map: Record<string, unknown>): unknown[] {
  return Object.entries(map)
    .filter(([, value]) => isGrammarEntryLike(value))
    .map(([slot, value]) => {
      const g = value as { regex: string; mappings: Record<string, string> };
      return {
        slot_filling: slot,
        question: null,
        grammar: { regex: g.regex, mappings: g.mappings },
        no_match_1: null,
        no_match_2: null,
        no_match_3: null,
        status: null,
      };
    });
}

function entriesToRows(entries: [string, unknown][]): unknown[] {
  return entries
    .filter(([, value]) => isRowLike(value))
    .map(([key, value]) => {
      const row = { ...(value as Record<string, unknown>) };
      if (
        typeof row.slot_filling !== 'string'
        && typeof row.slot !== 'string'
        && typeof row.path !== 'string'
      ) {
        row.slot_filling = key;
      }
      return row;
    });
}

const LAYER_WRAPPER_KEYS = [
  'grammar',
  'grammars',
  'grammatiche',
  'messages',
  'messaggi',
  'questions',
  'rows',
  'nodes',
  'slots',
  'data',
  'items',
] as const;

function tryUnwrapLayer(obj: Record<string, unknown>): unknown[] | null {
  for (const key of LAYER_WRAPPER_KEYS) {
    const inner = obj[key];
    if (!inner || typeof inner !== 'object' || Array.isArray(inner)) continue;
    const innerObj = inner as Record<string, unknown>;

    if (isKeyedGrammarMap(innerObj)) {
      const grammarRows = grammarMapToRows(innerObj);
      if (grammarRows.length > 0) return grammarRows;
    }

    const rowEntries = entriesToRows(Object.entries(innerObj));
    if (rowEntries.length > 0) return rowEntries;
  }
  return null;
}

/**
 * Normalizes OpenAI JSON into the rows array expected by post-processors.
 * Accepts { rows: [...] }, keyed maps, and { grammar: { slot: { regex, mappings } } }.
 */
export function coerceAiResponseToRows(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Risposta AI non è un oggetto JSON valido');
  }

  const obj = parsed as Record<string, unknown>;

  if (Array.isArray(obj.rows)) return obj.rows;

  const unwrapped = tryUnwrapLayer(obj);
  if (unwrapped) return unwrapped;

  if (obj.rows && typeof obj.rows === 'object' && !Array.isArray(obj.rows)) {
    const rowsObj = obj.rows as Record<string, unknown>;
    if (isKeyedGrammarMap(rowsObj)) return grammarMapToRows(rowsObj);
    const fromRowsObject = entriesToRows(Object.entries(rowsObj));
    if (fromRowsObject.length > 0) return fromRowsObject;
  }

  for (const key of ['nodes', 'data', 'slots', 'items']) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }

  if (isKeyedGrammarMap(obj)) return grammarMapToRows(obj);

  const fromKeyed = entriesToRows(Object.entries(obj));
  if (fromKeyed.length > 0) return fromKeyed;

  throw new Error(
    'Formato risposta AI non riconosciuto: usa { "rows": [ { "slot_filling": "...", ... } ] }',
  );
}

/** Parses raw OpenAI message content and normalizes it to a rows array. */
export function parseOpenAiContent(rawContent: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    try {
      parsed = JSON.parse(sanitizeOpenAiJsonRegex(rawContent));
    } catch {
      throw new Error(`JSON OpenAI non valido: ${rawContent.slice(0, 200)}`);
    }
  }
  return coerceAiResponseToRows(parsed);
}
