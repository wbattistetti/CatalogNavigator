-- ElevenLabs ConvAI agent link per KB document.
create table if not exists kb_convai_links (
  document_id       uuid primary key references kb_documents(id) on delete cascade,
  agent_id          text not null,
  agent_name        text,
  last_synced_at    timestamptz not null default now(),
  bundle_compiled_at timestamptz,
  public_base_url   text,
  link_json         jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table kb_convai_links enable row level security;

create policy "anon_select_kb_convai_links" on kb_convai_links
  for select to anon, authenticated using (true);

create policy "anon_insert_kb_convai_links" on kb_convai_links
  for insert to anon, authenticated with check (true);

create policy "anon_update_kb_convai_links" on kb_convai_links
  for update to anon, authenticated using (true) with check (true);

create policy "anon_delete_kb_convai_links" on kb_convai_links
  for delete to anon, authenticated using (true);
