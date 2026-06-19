-- Catalog Navigator: Omnia-style project metadata for landing page.
alter table kb_projects
  add column if not exists client text,
  add column if not exists industry text,
  add column if not exists industry_custom text,
  add column if not exists version_major int not null default 1,
  add column if not exists version_minor int not null default 0,
  add column if not exists version_qualifier text not null default 'alpha',
  add column if not exists language text not null default 'it',
  add column if not exists owner_company text,
  add column if not exists owner_client text,
  add column if not exists status text not null default 'active'
    check (status in ('draft', 'active'));

-- Existing projects with a linked document are active catalog entries.
update kb_projects p
set status = 'active', updated_at = now()
where exists (
  select 1 from kb_documents d where d.project_id = p.id
);

-- Orphan-less drafts (no document yet) stay or become draft.
update kb_projects p
set status = 'draft', updated_at = now()
where not exists (
  select 1 from kb_documents d where d.project_id = p.id
);
