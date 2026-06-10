/**
 * CRUD and project wiring for library / project-scoped dictionaries.
 */
import type { TokenCategory } from './dictionaryTree';
import { loadSavedCategories, syncCategoriesWithTokens } from './dictionaryTree';
import {
  defaultIconForIndustry,
  validateDictionaryMeta,
} from './dictionaryIndustries';
import type { KbDocument, SavedTokenDictionary } from './supabase';
import { supabase } from './supabase';
import { loadSavedTokens, type TokenEntry } from './tokenDictionary';

export type DictionaryScope = 'library' | 'project';

export interface KbProject {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface KbDictionary {
  id: string;
  name: string;
  industry: string;
  industry_custom: string | null;
  description: string | null;
  scope: DictionaryScope;
  project_id: string | null;
  icon_key: string;
  icon_color: string;
  categories: TokenCategory[];
  tokens: TokenEntry[];
  created_at: string;
  updated_at: string;
}

export interface CreateDictionaryInput {
  name: string;
  industry: string;
  industryCustom?: string | null;
  description?: string | null;
  scope: DictionaryScope;
  projectId?: string | null;
}

function rowToDictionary(row: Record<string, unknown>): KbDictionary {
  return {
    id: String(row.id),
    name: String(row.name),
    industry: String(row.industry),
    industry_custom: row.industry_custom != null ? String(row.industry_custom) : null,
    description: row.description != null ? String(row.description) : null,
    scope: row.scope as DictionaryScope,
    project_id: row.project_id != null ? String(row.project_id) : null,
    icon_key: String(row.icon_key ?? 'BookOpen'),
    icon_color: String(row.icon_color ?? '#38bdf8'),
    categories: Array.isArray(row.categories) ? (row.categories as TokenCategory[]) : [],
    tokens: Array.isArray(row.tokens) ? (row.tokens as TokenEntry[]) : [],
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function normalizeDictionaryContent(tokens: TokenEntry[], categories: TokenCategory[]): {
  tokens: TokenEntry[];
  categories: TokenCategory[];
} {
  const synced = syncCategoriesWithTokens(categories, tokens);
  return { tokens, categories: synced };
}

/** Ensures the document belongs to a project (creates one if needed). */
export async function ensureProjectForDocument(doc: KbDocument): Promise<{
  project: KbProject;
  doc: KbDocument;
}> {
  if (doc.project_id) {
    const { data, error } = await supabase
      .from('kb_projects')
      .select('*')
      .eq('id', doc.project_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return { project: data as KbProject, doc };
    // Stale project_id (es. dopo db reset): ricrea il progetto.
  }

  const { data: project, error: projErr } = await supabase
    .from('kb_projects')
    .insert({ name: doc.name.replace(/\.[^.]+$/, '') || doc.name })
    .select('*')
    .single();
  if (projErr || !project) throw new Error(projErr?.message ?? 'Progetto non creato');

  const { data: updatedDoc, error: docErr } = await supabase
    .from('kb_documents')
    .update({ project_id: project.id })
    .eq('id', doc.id)
    .select('*')
    .maybeSingle();
  if (docErr || !updatedDoc) throw new Error(docErr?.message ?? 'Documento non aggiornato');

  return { project: project as KbProject, doc: updatedDoc as KbDocument };
}

/** Lists all library dictionaries plus project-scoped dictionaries for a project. */
export async function listAvailableDictionaries(projectId: string): Promise<KbDictionary[]> {
  const [libRes, projRes] = await Promise.all([
    supabase.from('kb_dictionaries').select('*').eq('scope', 'library').order('name'),
    supabase
      .from('kb_dictionaries')
      .select('*')
      .eq('scope', 'project')
      .eq('project_id', projectId)
      .order('name'),
  ]);
  if (libRes.error) throw new Error(libRes.error.message);
  if (projRes.error) throw new Error(projRes.error.message);
  return [...(libRes.data ?? []), ...(projRes.data ?? [])].map((row) =>
    rowToDictionary(row as Record<string, unknown>),
  );
}

/** Project-scoped custom dictionaries owned by the project. */
export async function listProjectDictionaries(projectId: string): Promise<KbDictionary[]> {
  const { data, error } = await supabase
    .from('kb_dictionaries')
    .select('*')
    .eq('scope', 'project')
    .eq('project_id', projectId)
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => rowToDictionary(row as Record<string, unknown>));
}

/** Library dictionaries linked to a project for segmentation. */
export async function listLinkedLibraryDictionaries(
  projectId: string,
): Promise<Array<{ dictionary: KbDictionary; sortOrder: number }>> {
  const { data: links, error } = await supabase
    .from('kb_project_dictionaries')
    .select('dictionary_id, sort_order')
    .eq('project_id', projectId)
    .order('sort_order');
  if (error) throw new Error(error.message);
  if (!links?.length) return [];

  const ids = links.map((l) => String(l.dictionary_id));
  const { data: dictRows, error: dictErr } = await supabase
    .from('kb_dictionaries')
    .select('*')
    .in('id', ids);
  if (dictErr) throw new Error(dictErr.message);

  const byId = new Map(
    (dictRows ?? []).map((row) => [String(row.id), rowToDictionary(row as Record<string, unknown>)]),
  );

  return links.flatMap((link) => {
    const dictionary = byId.get(String(link.dictionary_id));
    if (!dictionary) return [];
    return [{ dictionary, sortOrder: Number(link.sort_order ?? 0) }];
  });
}

export async function createDictionary(input: CreateDictionaryInput): Promise<KbDictionary> {
  validateDictionaryMeta({
    name: input.name,
    industry: input.industry,
    industryCustom: input.industryCustom,
  });

  if (input.scope === 'project' && !input.projectId) {
    throw new Error('projectId obbligatorio per dizionari di progetto');
  }
  if (input.scope === 'library' && input.projectId) {
    throw new Error('I dizionari di libreria non hanno projectId');
  }

  const { iconKey, iconColor } = defaultIconForIndustry(input.industry);
  const { data, error } = await supabase
    .from('kb_dictionaries')
    .insert({
      name: input.name.trim(),
      industry: input.industry,
      industry_custom: input.industry === 'other' ? input.industryCustom?.trim() ?? null : null,
      description: input.description?.trim() || null,
      scope: input.scope,
      project_id: input.scope === 'project' ? input.projectId : null,
      icon_key: iconKey,
      icon_color: iconColor,
      categories: [],
      tokens: [],
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Dizionario non creato');
  return rowToDictionary(data as Record<string, unknown>);
}

export async function updateDictionary(
  id: string,
  patch: {
    name?: string;
    industry?: string;
    industryCustom?: string | null;
    description?: string | null;
    iconKey?: string;
    iconColor?: string;
    tokens?: TokenEntry[];
    categories?: TokenCategory[];
  },
): Promise<KbDictionary> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (patch.name !== undefined || patch.industry !== undefined) {
    validateDictionaryMeta({
      name: patch.name ?? 'x',
      industry: patch.industry ?? 'other',
      industryCustom: patch.industryCustom,
    });
  }

  if (patch.name !== undefined) payload.name = patch.name.trim();
  if (patch.industry !== undefined) payload.industry = patch.industry;
  if (patch.industryCustom !== undefined) payload.industry_custom = patch.industryCustom;
  if (patch.description !== undefined) payload.description = patch.description?.trim() || null;
  if (patch.iconKey !== undefined) payload.icon_key = patch.iconKey;
  if (patch.iconColor !== undefined) payload.icon_color = patch.iconColor;

  if (patch.tokens !== undefined || patch.categories !== undefined) {
    const { data: current, error: fetchErr } = await supabase
      .from('kb_dictionaries')
      .select('tokens, categories')
      .eq('id', id)
      .single();
    if (fetchErr || !current) throw new Error(fetchErr?.message ?? 'Dizionario non trovato');

    const tokens = patch.tokens ?? (current.tokens as TokenEntry[]);
    const categories = patch.categories ?? (current.categories as TokenCategory[]);
    const normalized = normalizeDictionaryContent(tokens, categories);
    payload.tokens = normalized.tokens.map(({ text, enabled, suppressedBy, aliasOf, grammar }) => ({
      text, enabled, suppressedBy, aliasOf, grammar: grammar ?? null,
    }));
    payload.categories = normalized.categories.map(({
      id: catId, name, order, tokenTexts, iconKey, iconColor,
    }) => ({
      id: catId, name, order, tokenTexts, iconKey, iconColor,
    }));
  }

  const { data, error } = await supabase
    .from('kb_dictionaries')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Salvataggio dizionario fallito');
  return rowToDictionary(data as Record<string, unknown>);
}

export async function linkLibraryDictionary(
  projectId: string,
  dictionaryId: string,
): Promise<void> {
  const { data: maxRow } = await supabase
    .from('kb_project_dictionaries')
    .select('sort_order')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const sortOrder = maxRow ? Number(maxRow.sort_order) + 1 : 0;
  const { error } = await supabase
    .from('kb_project_dictionaries')
    .upsert({ project_id: projectId, dictionary_id: dictionaryId, sort_order: sortOrder });
  if (error) throw new Error(error.message);
}

export async function unlinkLibraryDictionary(
  projectId: string,
  dictionaryId: string,
): Promise<void> {
  const { error } = await supabase
    .from('kb_project_dictionaries')
    .delete()
    .eq('project_id', projectId)
    .eq('dictionary_id', dictionaryId);
  if (error) throw new Error(error.message);
}

/** Creates an empty project dictionary when the project has none loaded yet. */
export async function ensureDefaultProjectDictionary(
  projectId: string,
  docName: string,
): Promise<KbDictionary | null> {
  const [projectDicts, linked] = await Promise.all([
    listProjectDictionaries(projectId),
    listLinkedLibraryDictionaries(projectId),
  ]);
  if (projectDicts.length > 0 || linked.length > 0) return null;

  const baseName = 'Project';
  return createDictionary({
    name: baseName,
    industry: 'technology',
    description: 'Dizionario di progetto creato automaticamente',
    scope: 'project',
    projectId,
  });
}

/** Migrates legacy kb_documents.token_dictionary into a project-scoped dictionary. */
export async function migrateLegacyDocumentDictionary(
  doc: KbDocument,
  projectId: string,
  descriptionColumn: string,
): Promise<KbDictionary | null> {
  const saved = doc.token_dictionary;
  if (!saved?.descriptionColumn) return null;

  const tokens = loadSavedTokens(saved as SavedTokenDictionary, descriptionColumn);
  const categories = syncCategoriesWithTokens(
    loadSavedCategories(saved as SavedTokenDictionary),
    tokens,
  );
  if (tokens.length === 0 && categories.length === 0) return null;

  const { data: existing } = await supabase
    .from('kb_dictionaries')
    .select('id')
    .eq('project_id', projectId)
    .eq('scope', 'project')
    .limit(1);
  if (existing && existing.length > 0) return null;

  const baseName = doc.name.replace(/\.[^.]+$/, '') || 'Documento';
  return createDictionary({
    name: `${baseName} (migrato)`,
    industry: 'other',
    industryCustom: 'legacy',
    description: 'Migrato da token_dictionary del documento',
    scope: 'project',
    projectId,
  }).then((dict) =>
    updateDictionary(dict.id, { tokens, categories }),
  );
}

export function dictionaryDisplayLabel(dict: KbDictionary): string {
  const industry = dict.industry === 'other' && dict.industry_custom
    ? dict.industry_custom
    : dict.industry;
  return `${dict.name} · ${industry}`;
}
