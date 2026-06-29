-- Extra column tokens per corpus row (extends item paths at compile time).
ALTER TABLE kb_analyses
  ADD COLUMN IF NOT EXISTS corpus_extra_annotations JSONB DEFAULT NULL;
