import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@utils/supabase/server";
import crypto from "crypto";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

// Simple text chunking function
function chunkText(
  text: string,
  maxChunkSize: number = 1000,
  overlap: number = 200
): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  let currentChunk = "";

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;

    // If adding this sentence would exceed the max size, start a new chunk
    if (
      currentChunk.length + trimmedSentence.length > maxChunkSize &&
      currentChunk.length > 0
    ) {
      chunks.push(currentChunk.trim());

      // Start new chunk with overlap from the end of previous chunk
      const words = currentChunk.split(" ");
      const overlapWords = words.slice(-Math.floor(overlap / 6)); // Rough estimation
      currentChunk = overlapWords.join(" ") + " " + trimmedSentence;
    } else {
      currentChunk += (currentChunk.length > 0 ? ". " : "") + trimmedSentence;
    }
  }

  // Add the final chunk if it has content
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter((chunk) => chunk.length > 50); // Filter out very small chunks
}

// Extract text from different file types
async function extractTextFromFile(
  buffer: Buffer,
  contentType: string
): Promise<string> {
  try {
    if (contentType === "application/pdf") {
      const data = await pdfParse(buffer);
      return data.text;
    } else if (
      contentType.includes("word") ||
      contentType.includes("document")
    ) {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } else if (contentType.includes("text")) {
      return buffer.toString("utf-8");
    } else {
      throw new Error(`Unsupported file type: ${contentType}`);
    }
  } catch (error) {
    console.error("Text extraction error:", error);
    throw new Error(
      `Failed to extract text: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

// Generate embeddings using a simple approach (in production, you'd use a proper embedding model)
async function generateEmbedding(text: string): Promise<number[]> {
  // For now, we'll create a simple hash-based embedding
  // In production, you'd use models like all-MiniLM-L6-v2, OpenAI embeddings, etc.
  const hash = crypto.createHash("sha256").update(text).digest();

  // Convert hash to 384-dimensional vector (matching our DB schema)
  const embedding: number[] = [];
  for (let i = 0; i < 384; i++) {
    const byteIndex = i % hash.length;
    const bitIndex = i % 8;
    const byteValue = hash[byteIndex];
    const bitValue = (byteValue >> bitIndex) & 1;
    // Normalize to [-1, 1] range
    embedding.push(
      bitValue === 1 ? Math.random() - 0.5 : -(Math.random() - 0.5)
    );
  }

  return embedding;
}

export async function POST(request: NextRequest) {
  console.log('🔄 Process document API called');
  try {
    console.log('📡 Creating Supabase client...');
    const supabase = await createClient();
    console.log('✅ Supabase client created');

    // Check authentication
    console.log('🔐 Checking authentication...');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      console.log('❌ Authentication failed:', authError);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.log('✅ User authenticated:', user.id);

    console.log('📥 Parsing request body...');
    const { documentId } = await request.json();
    console.log('📄 Document ID:', documentId);

    if (!documentId) {
      return NextResponse.json(
        { error: "Document ID is required" },
        { status: 400 }
      );
    }

    // Get the document from database
    const { data: document, error: docError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .single();

    if (docError || !document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    if (document.processed) {
      return NextResponse.json(
        { error: "Document already processed" },
        { status: 400 }
      );
    }

    try {
      // Step 1: Decrypt the file content
      const encryptedContent = Buffer.from(
        document.encrypted_content,
        "base64"
      );
      const encryptionKey = Buffer.from(document.encryption_key, "base64");
      const iv = Buffer.from(document.iv, "base64");

      const decipher = crypto.createDecipheriv(
        "aes-256-cbc",
        encryptionKey,
        iv
      );
      const decryptedContent = Buffer.concat([
        decipher.update(encryptedContent),
        decipher.final(),
      ]);

      // Step 2: Extract text from the decrypted file
      console.log("Extracting text from file type:", document.content_type);
      const extractedText = await extractTextFromFile(
        decryptedContent,
        document.content_type
      );

      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error("No text could be extracted from the document");
      }

      // Step 3: Chunk the text
      console.log("Chunking text, total length:", extractedText.length);
      const chunks = chunkText(extractedText, 800, 150); // Smaller chunks for better retrieval
      console.log("Created chunks:", chunks.length);

      // Step 4: Generate embeddings and store chunks
      const chunkInserts = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = await generateEmbedding(chunk);

        chunkInserts.push({
          document_id: documentId,
          user_id: user.id,
          chunk_index: i,
          content: chunk,
          token_count: Math.ceil(chunk.length / 4), // Rough token estimation
          embedding: embedding,
        });
      }

      // Insert all chunks
      const { error: chunksError } = await supabase
        .from("document_chunks")
        .insert(chunkInserts);

      if (chunksError) {
        console.error("Error inserting chunks:", chunksError);
        throw chunksError;
      }

      // Step 5: Update document as processed
      const { error: updateError } = await supabase
        .from("documents")
        .update({
          processed: true,
          extracted_text: extractedText.substring(0, 10000), // Store first 10k chars for reference
          updated_at: new Date().toISOString(),
        })
        .eq("id", documentId);

      if (updateError) {
        console.error("Error updating document:", updateError);
        throw updateError;
      }

      return NextResponse.json({
        success: true,
        message: "Document processed successfully",
        chunks: chunks.length,
        extractedLength: extractedText.length,
      });
    } catch (processingError) {
      console.error("Processing error:", processingError);

      // Update document with error
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

      throw processingError;
    }
  } catch (error) {
    console.error("💥 Document processing error:", error);
    console.error("💥 Error stack:", error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Processing failed" },
      { status: 500 }
    );
  }
}
