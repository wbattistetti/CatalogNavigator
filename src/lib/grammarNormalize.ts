/**
 * Canonical normalization and validation for NLU grammar regex strings.
 * Every grammar.regex must pass through normalizeGrammarRegex before storage and matching.
 */

import type { GrammarEntry } from '../hooks/useAnalysis';

const META_CHARS = 'wWdDsSpPhHvVbBnNrRtT0';

/** Fixes characters corrupted when JSON.parse interprets \\b as backspace. */
export function fixJsonEscapeCorruption(pattern: string): string {
  return pattern.replace(/\x08/g, '\\b');
}

/** Collapses over-escaped metacharacters (\\\\w → \\w). */
export function collapseOverEscapedMetachars(pattern: string): string {
  const re = new RegExp(`\\\\\\\\([${META_CHARS}])`, 'g');
  return pattern.replace(re, '\\$1');
}

/** Converts Python-style named groups to JavaScript (?<name>). */
export function convertPythonNamedGroups(pattern: string): string {
  return pattern
    .replace(/\(\?P</g, '(?<')
    .replace(/\(\?P\\([A-Za-z_][A-Za-z0-9_]*)/g, '(?<$1');
}

/** JS named capture group: letter/underscore first, then letters, digits, underscore. */
export const VALID_CAPTURE_GROUP_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Human-readable rule text for UI and prompts. */
export const CAPTURE_GROUP_NAME_RULES =
  'Solo lettere, cifre e underscore; deve iniziare con lettera o underscore. '
  + 'Vietati trattini, spazi, punti e altri simboli (es. pet-tc → pet_tc, 3d → g_3d).';

/** True when a name is already valid for JavaScript (?<name>). */
export function isValidCaptureGroupName(name: string): boolean {
  return VALID_CAPTURE_GROUP_NAME.test(name.trim());
}

/** Extracts raw (?P<name>) / (?<name>) identifiers before normalization. */
export function extractRawNamedGroupNames(pattern: string): string[] {
  const names: string[] = [];
  const re = /\(\?(?:P)?<([^>]+)>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(pattern)) !== null) {
    names.push(match[1]!);
  }
  return names;
}

/** Describes why a capture group name is invalid (null when valid). */
export function describeInvalidCaptureGroupName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'nome vuoto';
  if (/[^\w]/.test(trimmed)) {
    const bad = [...new Set(trimmed.match(/[^\w]/g) ?? [])].join(' ');
    return `caratteri non ammessi: ${bad}`;
  }
  if (/^\d/.test(trimmed)) return 'non può iniziare con una cifra';
  if (!isValidCaptureGroupName(trimmed)) return 'formato non valido';
  return null;
}

/** Lists capture group names in a regex that violate JS rules. */
export function findInvalidCaptureGroupNames(pattern: string): string[] {
  const invalid: string[] = [];
  for (const name of extractRawNamedGroupNames(pattern)) {
    if (!isValidCaptureGroupName(name)) invalid.push(name);
  }
  return invalid;
}

/** Derives a valid group name from a slot path segment (last segment or label). */
export function groupNameFromSlotSegment(segment: string): string {
  return sanitizeCaptureGroupName(
    segment.trim().replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, '-').replace(/[\s\-.]+/g, '_'),
  );
}

/** Makes a capture group name valid for JavaScript (?<name>) — letters, digits, underscore; no leading digit. */
export function sanitizeCaptureGroupName(name: string): string {
  const base = name
    .trim()
    .replace(/[^\w]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  if (!base) return 'g';
  if (/^\d/.test(base)) return `g_${base}`;
  return base;
}

/** Rewrites (?P<bad-name>) / (?<bad-name>) to JS-safe identifiers. */
export function sanitizeNamedGroupsInPattern(pattern: string): {
  pattern: string;
  renames: Map<string, string>;
} {
  const renames = new Map<string, string>();
  const sanitized = pattern.replace(/\(\?(?:P)?<([^>]+)>/g, (full, raw: string) => {
    const safe = sanitizeCaptureGroupName(raw);
    if (raw !== safe) renames.set(raw, safe);
    const isPython = full.startsWith('(?P<');
    return isPython ? `(?P<${safe}>` : `(?<${safe}>`;
  });
  return { pattern: sanitized, renames };
}

/** Aligns mapping keys with sanitized capture group names. */
export function remapMappingsForRenamedGroups(
  mappings: Record<string, string>,
  renames: Map<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(mappings)) {
    const newKey = renames.get(key) ?? sanitizeCaptureGroupName(key);
    out[newKey] = value;
  }
  return out;
}

/**
 * Normalizes a raw regex into JS-ready form for storage and RegExp construction.
 * Idempotent: safe to call multiple times on the same string.
 */
export function normalizeGrammarRegex(raw: string): string {
  if (!raw?.trim()) return raw;
  let pattern = raw.trim();
  pattern = fixJsonEscapeCorruption(pattern);
  for (let i = 0; i < 4; i++) {
    const next = collapseOverEscapedMetachars(pattern);
    if (next === pattern) break;
    pattern = next;
  }
  pattern = sanitizeNamedGroupsInPattern(pattern).pattern;
  pattern = convertPythonNamedGroups(pattern);
  return pattern;
}

/** Extracts (?<name>) capture group identifiers. */
export function extractNamedGroupNames(pattern: string): string[] {
  const names: string[] = [];
  const re = /\(\?<([A-Za-z_][A-Za-z0-9_]*)>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(pattern)) !== null) {
    names.push(match[1]!);
  }
  return names;
}

export interface GrammarValidationResult {
  valid: boolean;
  normalizedRegex: string;
  normalizedMappings?: Record<string, string>;
  error?: string;
  missingMappings?: string[];
  /** Set when invalid group names were auto-corrected during normalization. */
  groupNameWarnings?: string[];
}

function formatInvalidGroupNamesError(invalidNames: string[]): string {
  const details = invalidNames.map((name) => {
    const reason = describeInvalidCaptureGroupName(name);
    const suggested = sanitizeCaptureGroupName(name);
    return `'${name}' (${reason ?? 'non valido'}) → usa '${suggested}'`;
  });
  return `Nomi gruppo non validi in (?P<nome>): ${details.join('; ')}. ${CAPTURE_GROUP_NAME_RULES}`;
}

function buildGroupNameWarnings(regex: string, mappings?: Record<string, string>): string[] {
  const warnings: string[] = [];
  for (const raw of extractRawNamedGroupNames(regex)) {
    if (!isValidCaptureGroupName(raw)) {
      warnings.push(`'${raw}' → '${sanitizeCaptureGroupName(raw)}'`);
    }
  }
  if (mappings) {
    for (const key of Object.keys(mappings)) {
      if (!isValidCaptureGroupName(key)) {
        const fix = sanitizeCaptureGroupName(key);
        const line = `mapping '${key}' → '${fix}'`;
        if (!warnings.some((w) => w.includes(line))) warnings.push(line);
      }
    }
  }
  return warnings;
}

/** Validates regex syntax and mapping coverage for named groups. */
export function validateGrammarRegex(
  regex: string,
  mappings?: Record<string, string>,
): GrammarValidationResult {
  const invalidRawGroups = findInvalidCaptureGroupNames(regex);
  const invalidMappingKeys = mappings
    ? Object.keys(mappings).filter((key) => !isValidCaptureGroupName(key))
    : [];

  const entry = mappings
    ? normalizeGrammarEntry({ regex, mappings })
    : { regex: normalizeGrammarRegex(regex), mappings: {} };
  const normalizedRegex = entry.regex;
  const groupNameWarnings = buildGroupNameWarnings(regex, mappings);

  try {
    new RegExp(normalizedRegex, 'iu');

    if (mappings) {
      const groupNames = extractNamedGroupNames(normalizedRegex);
      const missingMappings = groupNames.filter((name) => !entry.mappings[name]?.trim());
      if (missingMappings.length > 0) {
        return {
          valid: false,
          normalizedRegex,
          normalizedMappings: entry.mappings,
          error: `Mapping mancanti per i gruppi: ${missingMappings.join(', ')}`,
          missingMappings,
          groupNameWarnings,
        };
      }
    }

    return {
      valid: true,
      normalizedRegex,
      normalizedMappings: entry.mappings,
      groupNameWarnings: groupNameWarnings.length > 0 ? groupNameWarnings : undefined,
    };
  } catch (err) {
    if (invalidRawGroups.length > 0 || invalidMappingKeys.length > 0) {
      const bad = [...new Set([...invalidRawGroups, ...invalidMappingKeys])];
      return {
        valid: false,
        normalizedRegex,
        normalizedMappings: entry.mappings,
        error: formatInvalidGroupNamesError(bad),
        groupNameWarnings,
      };
    }
    return {
      valid: false,
      normalizedRegex,
      normalizedMappings: entry.mappings,
      error: err instanceof Error ? err.message : String(err),
      groupNameWarnings,
    };
  }
}

/** Compiles a normalized grammar regex for runtime matching. */
export function compileGrammarRegex(pattern: string): RegExp {
  const normalized = normalizeGrammarRegex(pattern);
  return new RegExp(normalized, 'iu');
}

/** Normalizes regex and mapping keys for safe JS named-group matching. */
export function normalizeGrammarEntry(grammar: GrammarEntry): GrammarEntry {
  if (!grammar.regex?.trim()) return grammar;

  let pattern = grammar.regex.trim();
  pattern = fixJsonEscapeCorruption(pattern);
  for (let i = 0; i < 4; i++) {
    const next = collapseOverEscapedMetachars(pattern);
    if (next === pattern) break;
    pattern = next;
  }

  const { pattern: withSafeGroups, renames } = sanitizeNamedGroupsInPattern(pattern);
  pattern = convertPythonNamedGroups(withSafeGroups);

  const mappings = grammar.mappings
    ? remapMappingsForRenamedGroups(grammar.mappings, renames)
    : {};

  return {
    ...grammar,
    regex: pattern,
    mappings,
  };
}

/**
 * Sanitizes raw OpenAI JSON text so invalid escape sequences parse correctly.
 * Used by the edge proxy when JSON.parse fails on the first attempt.
 */
export function sanitizeOpenAiJsonRegex(raw: string): string {
  return raw.replace(new RegExp(`\\\\([${META_CHARS}])`, 'g'), '\\\\$1');
}
