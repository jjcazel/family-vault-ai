import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@utils/supabase/server";
import crypto from "crypto";
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
      try {
        // First try pdf-parse
        const pdfParse = (await import("pdf-parse")).default;
        const data = await pdfParse(buffer);

        if (!data.text || data.text.trim().length === 0) {
          throw new Error("No text content found in PDF");
        }

        return data.text;
      } catch {
        try {
          // Try pdf2json as alternative
          const PDFParser = (await import("pdf2json")).default;

          return new Promise((resolve, reject) => {
            const pdfParser = new PDFParser();

            pdfParser.on("pdfParser_dataError", (errData: unknown) => {
              reject(new Error(`PDF parsing error: ${errData}`));
            });

            pdfParser.on("pdfParser_dataReady", (pdfData: unknown) => {
              try {
                let extractedText = "";
                const data = pdfData as {
                  Pages?: Array<{
                    Texts?: Array<{ R?: Array<{ T?: string }> }>;
                  }>;
                };

                // Extract text from parsed data
                if (data.Pages && Array.isArray(data.Pages)) {
                  for (const page of data.Pages) {
                    if (page.Texts && Array.isArray(page.Texts)) {
                      for (const textItem of page.Texts) {
                        if (textItem.R && Array.isArray(textItem.R)) {
                          for (const run of textItem.R) {
                            if (run.T) {
                              extractedText += decodeURIComponent(run.T) + " ";
                            }
                          }
                        }
                      }
                    }
                  }
                }

                if (extractedText.trim().length > 0) {
                  resolve(extractedText.trim());
                } else {
                  reject(new Error("No text content found with pdf2json"));
                }
              } catch (parseErr) {
                reject(parseErr);
              }
            });

            // Parse the buffer
            pdfParser.parseBuffer(buffer);
          });
        } catch {
          return "PDF text extraction failed with multiple methods. This PDF may be image-based or have a complex format. Please try converting it to a text file or use a different PDF.";
        }
      }
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
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const documentId = body.documentId;

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
      const extractedText = await extractTextFromFile(
        decryptedContent,
        document.content_type
      );

      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error("No text could be extracted from the document");
      }

      // Step 3: Chunk the text
      const chunks = chunkText(extractedText, 800, 150); // Smaller chunks for better retrieval

      // Step 4: Generate embeddings and store chunks
      const chunkInserts = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        try {
          const embedding = await generateEmbedding(chunk);

          chunkInserts.push({
            document_id: documentId,
            user_id: user.id,
            chunk_index: i,
            content: chunk,
            token_count: Math.ceil(chunk.length / 4), // Rough token estimation
            embedding: `[${embedding.join(",")}]`, // Format as PostgreSQL vector string
          });
        } catch (embeddingError) {
          throw new Error(
            `Failed to generate embedding for chunk ${i + 1}: ${
              embeddingError instanceof Error
                ? embeddingError.message
                : "Unknown error"
            }`
          );
        }
      }

      // Insert all chunks
      const { error: chunksError } = await supabase
        .from("document_chunks")
        .insert(chunkInserts);

      if (chunksError) {
        throw new Error(
          `Failed to store document chunks: ${chunksError.message}`
        );
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
        throw updateError;
      }

      return NextResponse.json({
        success: true,
        message: "Document processed successfully",
        chunks: chunks.length,
        extractedLength: extractedText.length,
      });
    } catch (processingError) {
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Processing failed" },
      { status: 500 }
    );
  }
}
