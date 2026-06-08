
create table kb_documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  format text not null,
  storage_path text not null,
  file_size bigint,
  column_headers jsonb default '[]',
  created_at timestamptz default now()
);

alter table kb_documents enable row level security;

create policy "anon_select_kb_documents" on kb_documents
  for select to anon, authenticated using (true);

create policy "anon_insert_kb_documents" on kb_documents
  for insert to anon, authenticated with check (true);

create policy "anon_update_kb_documents" on kb_documents
  for update to anon, authenticated using (true) with check (true);

create policy "anon_delete_kb_documents" on kb_documents
  for delete to anon, authenticated using (true);

insert into storage.buckets (id, name, public)
values ('kb-documents', 'kb-documents', true)
on conflict (id) do nothing;

create policy "anon_select_storage" on storage.objects
  for select to anon, authenticated using (bucket_id = 'kb-documents');

create policy "anon_insert_storage" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'kb-documents');

create policy "anon_update_storage" on storage.objects
  for update to anon, authenticated using (bucket_id = 'kb-documents');

create policy "anon_delete_storage" on storage.objects
  for delete to anon, authenticated using (bucket_id = 'kb-documents');
