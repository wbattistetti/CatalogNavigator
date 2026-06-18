alter table kb_analyses
  add column if not exists disambiguation_plan jsonb default null;
