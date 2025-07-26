import type { SupabaseClient } from "@supabase/supabase-js";

export type DocumentRecord = {
  id: string;
  user_id: string;
  processed: boolean;
  encrypted_content: string;
  encryption_key: string;
  iv: string;
  content_type: string;
  [key: string]: unknown;
};

export type DocumentChunkInsert = {
  document_id: string;
  user_id: string;
  chunk_index: number;
  content: string;
  token_count: number;
  embedding: string;
};

export async function fetchDocument(
  supabase: SupabaseClient,
  documentId: string,
  userId: string
): Promise<DocumentRecord> {
  const { data: document, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .eq("user_id", userId)
    .single();
  if (error || !document) throw new Error("Document not found");
  if (document.processed) throw new Error("Document already processed");
  return document;
}

export async function insertChunks(
  supabase: SupabaseClient,
  chunkInserts: DocumentChunkInsert[]
): Promise<void> {
  const { error } = await supabase.from("document_chunks").insert(chunkInserts);
  if (error) {
    throw new Error(`Failed to store document chunks: ${error.message}`);
  }
}

export async function updateDocumentStatus(
  supabase: SupabaseClient,
  documentId: string,
  extractedText: string
): Promise<void> {
  const { error } = await supabase
    .from("documents")
    .update({
      processed: true,
      extracted_text: extractedText.substring(0, 10000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);
  if (error) throw error;
}

export async function updateDocumentError(
  supabase: SupabaseClient,
  documentId: string,
  processingError: unknown
): Promise<void> {
  await supabase
    .from("documents")
    .update({
      processing_error:
        processingError instanceof Error
          ? processingError.message
          : "Unknown error",
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);
}
