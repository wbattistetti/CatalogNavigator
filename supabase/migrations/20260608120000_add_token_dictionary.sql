ALTER TABLE kb_documents ADD COLUMN IF NOT EXISTS token_dictionary jsonb DEFAULT NULL;
