alter table kb_analyses
  add column if not exists item_paths jsonb not null default '[]';
