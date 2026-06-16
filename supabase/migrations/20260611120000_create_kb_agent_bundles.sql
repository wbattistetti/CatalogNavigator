-- Compiled agent runtime bundles (published snapshots + optional preview history).
create table if not exists kb_agent_bundles (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references kb_documents(id) on delete cascade,
  mode        text not null check (mode in ('published', 'preview')),
  bundle      jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists kb_agent_bundles_document_mode_idx
  on kb_agent_bundles(document_id, mode, created_at desc);

alter table kb_agent_bundles enable row level security;

create policy "anon_select_kb_agent_bundles" on kb_agent_bundles
  for select to anon, authenticated using (true);

create policy "anon_insert_kb_agent_bundles" on kb_agent_bundles
  for insert to anon, authenticated with check (true);

create policy "anon_update_kb_agent_bundles" on kb_agent_bundles
  for update to anon, authenticated using (true) with check (true);

create policy "anon_delete_kb_agent_bundles" on kb_agent_bundles
  for delete to anon, authenticated using (true);
