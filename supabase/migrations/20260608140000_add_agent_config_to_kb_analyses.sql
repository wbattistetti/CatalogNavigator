alter table kb_analyses
  add column if not exists start_question text,
  add column if not exists confirmation_preamble text default 'Quindi confermo:';
