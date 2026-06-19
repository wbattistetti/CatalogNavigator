/**
 * Supabase CRUD for kb_projects catalog (Catalog Navigator landing).
 */
import { industryLabel } from '../lib/dictionaryIndustries';
import { supabase, type KbDocument, type KbProject } from '../lib/supabase';
import type { ProjectCatalogRow, ProjectInfo, ProjectStatus } from '../types/project';

type ProjectRow = KbProject & {
  client?: string | null;
  industry?: string | null;
  industry_custom?: string | null;
  version_major?: number;
  version_minor?: number;
  version_qualifier?: string;
  language?: string;
  owner_company?: string | null;
  owner_client?: string | null;
  status?: ProjectStatus;
};

function mapProjectRow(
  row: ProjectRow,
  doc?: { id: string; name: string } | null,
): ProjectCatalogRow {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    client: row.client ?? null,
    industry: row.industry ?? null,
    industryCustom: row.industry_custom ?? null,
    versionMajor: row.version_major ?? 1,
    versionMinor: row.version_minor ?? 0,
    versionQualifier: row.version_qualifier ?? 'alpha',
    language: (row.language === 'en' ? 'en' : 'it'),
    ownerCompany: row.owner_company ?? null,
    ownerClient: row.owner_client ?? null,
    status: row.status === 'draft' ? 'draft' : 'active',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    documentId: doc?.id ?? null,
    documentName: doc?.name ?? null,
  };
}

export function projectIndustryDisplay(row: ProjectCatalogRow): string {
  if (!row.industry) return '—';
  return industryLabel(row.industry, row.industryCustom);
}

export function projectVersionDisplay(row: ProjectCatalogRow): string {
  const base = `${row.versionMajor}.${row.versionMinor}`;
  const q = row.versionQualifier?.trim();
  return q ? `${base}-${q}` : base;
}

export function formatProjectDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

async function fetchDocumentsByProject(): Promise<Map<string, { id: string; name: string }>> {
  const { data, error } = await supabase
    .from('kb_documents')
    .select('id, name, project_id')
    .not('project_id', 'is', null);
  if (error) throw new Error(error.message);

  const map = new Map<string, { id: string; name: string }>();
  for (const doc of data ?? []) {
    if (doc.project_id && !map.has(doc.project_id)) {
      map.set(doc.project_id, { id: doc.id, name: doc.name });
    }
  }
  return map;
}

/** Lists all catalog projects with optional linked document metadata. */
export async function fetchAllProjects(): Promise<ProjectCatalogRow[]> {
  const [projRes, docMap] = await Promise.all([
    supabase.from('kb_projects').select('*').order('updated_at', { ascending: false }),
    fetchDocumentsByProject(),
  ]);
  if (projRes.error) throw new Error(projRes.error.message);
  return (projRes.data ?? []).map((row) =>
    mapProjectRow(row as ProjectRow, docMap.get(row.id) ?? null),
  );
}

/** Recent projects (same source, limited for the Recenti tab). */
export async function fetchRecentProjects(limit = 20): Promise<ProjectCatalogRow[]> {
  const all = await fetchAllProjects();
  return all.slice(0, limit);
}

export async function fetchCatalogClients(): Promise<string[]> {
  const { data, error } = await supabase
    .from('kb_projects')
    .select('client')
    .not('client', 'is', null);
  if (error) throw new Error(error.message);
  const values = new Set<string>();
  for (const row of data ?? []) {
    const v = row.client?.trim();
    if (v) values.add(v);
  }
  return [...values].sort((a, b) => a.localeCompare(b, 'it'));
}

export async function fetchCatalogIndustries(): Promise<string[]> {
  const rows = await fetchAllProjects();
  const values = new Set<string>();
  for (const row of rows) {
    const label = projectIndustryDisplay(row);
    if (label !== '—') values.add(label);
  }
  return [...values].sort((a, b) => a.localeCompare(b, 'it'));
}

/** Creates a draft project from the new-project form. */
export async function createProject(info: ProjectInfo): Promise<ProjectCatalogRow> {
  const name = info.name.trim();
  if (!name) throw new Error('Nome progetto obbligatorio');

  const { data, error } = await supabase
    .from('kb_projects')
    .insert({
      name,
      description: info.description.trim() || null,
      client: info.client.trim() || null,
      industry: info.industry || null,
      industry_custom: info.industry === 'other' ? info.industryCustom.trim() || null : null,
      version_major: info.versionMajor,
      version_minor: info.versionMinor,
      version_qualifier: info.versionQualifier.trim() || 'alpha',
      language: info.language,
      owner_company: info.ownerCompany.trim() || null,
      owner_client: info.ownerClient.trim() || null,
      status: 'draft',
    })
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'Progetto non creato');
  return mapProjectRow(data as ProjectRow, null);
}

/** Loads the document linked to a project (first / only). */
export async function fetchProjectDocument(projectId: string): Promise<KbDocument | null> {
  const { data, error } = await supabase
    .from('kb_documents')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as KbDocument | null) ?? null;
}

/** Marks project active after the first document upload. */
export async function activateProject(projectId: string): Promise<void> {
  const { error } = await supabase
    .from('kb_projects')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('id', projectId);
  if (error) throw new Error(error.message);
}

async function deleteProjectDocuments(projectId: string): Promise<void> {
  const { data: docs, error } = await supabase
    .from('kb_documents')
    .select('id, storage_path')
    .eq('project_id', projectId);
  if (error) throw new Error(error.message);

  for (const doc of docs ?? []) {
    await supabase.storage.from('kb-documents').remove([doc.storage_path]);
    const { error: delErr } = await supabase.from('kb_documents').delete().eq('id', doc.id);
    if (delErr) throw new Error(delErr.message);
  }
}

/** Deletes one project, its documents, and storage files. */
export async function deleteProject(projectId: string): Promise<void> {
  await deleteProjectDocuments(projectId);
  const { error } = await supabase.from('kb_projects').delete().eq('id', projectId);
  if (error) throw new Error(error.message);
}

/** Deletes every catalog project. */
export async function deleteAllProjects(): Promise<void> {
  const { data: projects, error } = await supabase.from('kb_projects').select('id');
  if (error) throw new Error(error.message);
  for (const p of projects ?? []) {
    await deleteProject(p.id);
  }
}
