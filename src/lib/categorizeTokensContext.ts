/**
 * Builds corpus context for AI token → category assignment.
 */
import type { ColumnRole } from '../../lib/supabase';
import { buildCorpusDescriptionsFromColumns, resolveCorpusColumns } from './columnRoles';
import { normalizeCategoryOrders, rootTokenTexts, type TokenCategory } from './dictionaryTree';
import type { TokenEntry } from './tokenDictionary';
import { findHighlightSpans } from './tokenDictionary';

export interface CategorizeCategoryCatalogEntry {
  id: string;
  name: string;
  order: number;
  tokens: string[];
  /** Real corpus sentences where this category's tokens appear (max 3). */
  corpusExamples: string[];
}

export interface CategorizeUncategorizedToken {
  token: string;
  snippets: string[];
}

export interface CategorizeTokensSnapshot {
  /** Full designer catalogation for inductive reasoning. */
  catalogation: CategorizeCategoryCatalogEntry[];
  uncategorized: CategorizeUncategorizedToken[];
  uncategorizedCount: number;
}

const MAX_SNIPPET_LEN = 140;
const MAX_SNIPPETS_PER_TOKEN = 2;
const MAX_EXAMPLES_PER_CATEGORY = 3;

function truncateSnippet(text: string, max = MAX_SNIPPET_LEN): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function snippetAroundToken(sentence: string, token: string): string {
  const lower = sentence.toLowerCase();
  const idx = lower.indexOf(token.toLowerCase());
  if (idx < 0) return truncateSnippet(sentence);
  const pad = 50;
  const start = Math.max(0, idx - pad);
  const end = Math.min(sentence.length, idx + token.length + pad);
  const slice = sentence.slice(start, end).trim();
  return truncateSnippet(start > 0 ? `…${slice}` : slice);
}

function categoryIdForToken(token: string, categories: TokenCategory[]): string | null {
  for (const cat of categories) {
    if (cat.tokenTexts.includes(token)) return cat.id;
  }
  return null;
}

/** Extracts ontology corpus strings from tabular document content. */
export function extractDescriptions(
  headers: string[],
  rows: string[][],
  columnRoles: Record<string, ColumnRole>,
): string[] {
  const columns = resolveCorpusColumns(headers, columnRoles);
  return buildCorpusDescriptionsFromColumns(headers, rows, columns).filter(Boolean);
}

/** Snapshot for AI: full catalogation + uncategorized tokens with context. */
export function buildCategorizeTokensSnapshot(
  tokens: TokenEntry[],
  categories: TokenCategory[],
  descriptions: string[],
): CategorizeTokensSnapshot {
  const uncategorizedTexts = rootTokenTexts(tokens, categories);
  const sorted = normalizeCategoryOrders(categories);

  const examplesByCategory = new Map<string, string[]>();
  const snippetsByToken = new Map<string, string[]>();

  for (const sentence of descriptions) {
    const spans = findHighlightSpans(sentence, tokens);
    if (spans.length === 0) continue;

    const categoriesInSentence = new Set<string>();

    for (const span of spans) {
      const canonical = span.canonical;
      const catId = categoryIdForToken(canonical, categories);

      if (catId) {
        categoriesInSentence.add(catId);
      }

      if (uncategorizedTexts.includes(canonical)) {
        const list = snippetsByToken.get(canonical) ?? [];
        if (list.length < MAX_SNIPPETS_PER_TOKEN) {
          list.push(snippetAroundToken(sentence, canonical));
          snippetsByToken.set(canonical, list);
        }
      }
    }

    for (const catId of categoriesInSentence) {
      const list = examplesByCategory.get(catId) ?? [];
      if (list.length < MAX_EXAMPLES_PER_CATEGORY) {
        list.push(truncateSnippet(sentence, 200));
        examplesByCategory.set(catId, list);
      }
    }
  }

  const catalogation: CategorizeCategoryCatalogEntry[] = sorted.map((c) => ({
    id: c.id,
    name: c.name,
    order: c.order,
    tokens: [...c.tokenTexts],
    corpusExamples: examplesByCategory.get(c.id) ?? [],
  }));

  const uncategorized: CategorizeUncategorizedToken[] = uncategorizedTexts.map((token) => ({
    token,
    snippets: snippetsByToken.get(token) ?? [],
  }));

  return {
    catalogation,
    uncategorized,
    uncategorizedCount: uncategorized.length,
  };
}
