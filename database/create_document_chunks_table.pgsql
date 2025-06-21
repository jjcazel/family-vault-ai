-- PostgreSQL SQL for Supabase
-- Create document_chunks table for storing processed text chunks and embeddings
-- STATUS: Applied to production database

CREATE TABLE document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL, -- Order of this chunk within the document
  content TEXT NOT NULL, -- The actual text content of this chunk
  token_count INTEGER, -- Number of tokens in this chunk
  embedding VECTOR(384), -- Vector embedding (384 dimensions for all-MiniLM-L6-v2)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX idx_document_chunks_user_id ON document_chunks(user_id);
CREATE INDEX idx_document_chunks_embedding ON document_chunks USING ivfflat (embedding vector_cosine_ops);

-- Row Level Security (RLS) policies
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access chunks from their own documents
CREATE POLICY "Users can access their own document chunks" ON document_chunks
  FOR ALL USING (auth.uid() = user_id);

-- Policy: Users can insert chunks for their own documents
CREATE POLICY "Users can insert their own document chunks" ON document_chunks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own document chunks
CREATE POLICY "Users can update their own document chunks" ON document_chunks
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can delete their own document chunks
CREATE POLICY "Users can delete their own document chunks" ON document_chunks
  FOR DELETE USING (auth.uid() = user_id);

-- Add extracted_text column to documents table for storing full extracted text
ALTER TABLE documents ADD COLUMN extracted_text TEXT;
ALTER TABLE documents ADD COLUMN processing_error TEXT;
