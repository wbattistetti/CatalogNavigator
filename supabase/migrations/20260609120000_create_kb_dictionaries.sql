-- Projects group documents and own custom dictionaries.
create table if not exists kb_projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table kb_projects enable row level security;

create policy "anon_select_kb_projects" on kb_projects
  for select to anon, authenticated using (true);

create policy "anon_insert_kb_projects" on kb_projects
  for insert to anon, authenticated with check (true);

create policy "anon_update_kb_projects" on kb_projects
  for update to anon, authenticated using (true) with check (true);

create policy "anon_delete_kb_projects" on kb_projects
  for delete to anon, authenticated using (true);

-- Shared library dictionaries and project-scoped custom dictionaries.
create table if not exists kb_dictionaries (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  industry        text not null,
  industry_custom text,
  description     text,
  scope           text not null check (scope in ('library', 'project')),
  project_id      uuid references kb_projects(id) on delete cascade,
  icon_key        text not null default 'BookOpen',
  icon_color      text not null default '#38bdf8',
  categories      jsonb not null default '[]'::jsonb,
  tokens          jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint project_dict_has_project
    check (scope = 'library' or project_id is not null),
  constraint library_dict_no_project
    check (scope = 'project' or project_id is null)
);

create index if not exists kb_dictionaries_scope_idx on kb_dictionaries(scope);
create index if not exists kb_dictionaries_project_idx on kb_dictionaries(project_id);

alter table kb_dictionaries enable row level security;

create policy "anon_select_kb_dictionaries" on kb_dictionaries
  for select to anon, authenticated using (true);

create policy "anon_insert_kb_dictionaries" on kb_dictionaries
  for insert to anon, authenticated with check (true);

create policy "anon_update_kb_dictionaries" on kb_dictionaries
  for update to anon, authenticated using (true) with check (true);

create policy "anon_delete_kb_dictionaries" on kb_dictionaries
  for delete to anon, authenticated using (true);

-- Which library dictionaries a project loads for segmentation.
create table if not exists kb_project_dictionaries (
  project_id    uuid not null references kb_projects(id) on delete cascade,
  dictionary_id uuid not null references kb_dictionaries(id) on delete cascade,
  sort_order    int not null default 0,
  primary key (project_id, dictionary_id)
);

alter table kb_project_dictionaries enable row level security;

create policy "anon_select_kb_project_dictionaries" on kb_project_dictionaries
  for select to anon, authenticated using (true);

create policy "anon_insert_kb_project_dictionaries" on kb_project_dictionaries
  for insert to anon, authenticated with check (true);

create policy "anon_update_kb_project_dictionaries" on kb_project_dictionaries
  for update to anon, authenticated using (true) with check (true);

create policy "anon_delete_kb_project_dictionaries" on kb_project_dictionaries
  for delete to anon, authenticated using (true);

alter table kb_documents
  add column if not exists project_id uuid references kb_projects(id) on delete set null;

create index if not exists kb_documents_project_idx on kb_documents(project_id);
