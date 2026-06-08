
create table kb_analyses (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references kb_documents(id) on delete cascade,
  rows jsonb not null default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table kb_analyses enable row level security;

create policy "anon_select_kb_analyses" on kb_analyses
  for select to anon, authenticated using (true);

create policy "anon_insert_kb_analyses" on kb_analyses
  for insert to anon, authenticated with check (true);

create policy "anon_update_kb_analyses" on kb_analyses
  for update to anon, authenticated using (true) with check (true);

create policy "anon_delete_kb_analyses" on kb_analyses
  for delete to anon, authenticated using (true);
