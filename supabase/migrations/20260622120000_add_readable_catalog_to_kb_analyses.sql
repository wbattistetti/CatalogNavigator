-- Per-path readable confirmation phrases for voice agent (catalogo leggibile).
ALTER TABLE kb_analyses
  ADD COLUMN IF NOT EXISTS readable_catalog jsonb;

COMMENT ON COLUMN kb_analyses.readable_catalog IS
  'Map path → { text, status } for spoken leaf confirmations (readable catalog tab).';
