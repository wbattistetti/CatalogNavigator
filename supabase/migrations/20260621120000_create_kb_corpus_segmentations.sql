-- Persisted per-document corpus segmentation (dictionary-matched chips + paths).
create table if not exists kb_corpus_segmentations (
  document_id uuid primary key references kb_documents(id) on delete cascade,
  signature text not null,
  unique_text_count integer not null default 0,
  entries jsonb not null default '{}',
  built_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kb_corpus_segmentations_signature_idx
  on kb_corpus_segmentations(signature);

alter table kb_corpus_segmentations enable row level security;

create policy "anon_select_kb_corpus_segmentations" on kb_corpus_segmentations
  for select to anon, authenticated using (true);

create policy "anon_insert_kb_corpus_segmentations" on kb_corpus_segmentations
  for insert to anon, authenticated with check (true);

create policy "anon_update_kb_corpus_segmentations" on kb_corpus_segmentations
  for update to anon, authenticated using (true) with check (true);

create policy "anon_delete_kb_corpus_segmentations" on kb_corpus_segmentations
  for delete to anon, authenticated using (true);
