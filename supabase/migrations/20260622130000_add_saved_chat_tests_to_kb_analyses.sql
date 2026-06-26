-- Manual VB chat sessions saved from the Test Motore VB panel.
ALTER TABLE kb_analyses
  ADD COLUMN IF NOT EXISTS saved_chat_tests jsonb;

COMMENT ON COLUMN kb_analyses.saved_chat_tests IS
  'Array of saved manual chat test snapshots (title, transcript, final path).';
