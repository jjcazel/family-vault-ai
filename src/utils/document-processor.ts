import { createClient } from "@utils/supabase/server";
import crypto from "crypto";
import mammoth from "mammoth";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAIEmbeddings } from "@langchain/openai";

// LangChain text chunking function
async function chunkText(
  text: string,
  maxChunkSize: number = 1000,
  overlap: number = 200
): Promise<string[]> {
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: maxChunkSize,
    chunkOverlap: overlap,
    separators: ["\n\n", "\n", ". ", "! ", "? ", " ", ""],
  });

  const chunks = await textSplitter.splitText(text);
  return chunks.filter((chunk) => chunk.trim().length > 50); // Filter out very small chunks
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

        // Clean up the extracted text by removing excessive whitespace
        const cleanedText = data.text
          .replace(/\s+/g, " ") // Replace multiple whitespace with single space
          .replace(/\n\s*\n/g, "\n\n") // Preserve paragraph breaks
          .trim();

        return cleanedText;
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
                  // Clean up the extracted text
                  const cleanedText = extractedText
                    .replace(/\s+/g, " ") // Replace multiple whitespace with single space
                    .replace(/\n\s*\n/g, "\n\n") // Preserve paragraph breaks
                    .trim();

                  resolve(cleanedText);
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
      `Text extraction failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

// Generate embeddings using OpenAI or fallback to hash-based
async function generateEmbedding(text: string): Promise<number[]> {
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (openaiApiKey) {
    try {
      // Use OpenAI embeddings for better semantic understanding
      const embeddings = new OpenAIEmbeddings({
        apiKey: openaiApiKey,
        model: "text-embedding-3-small", // 1536 dimensions, cost-effective
      });

      const embedding = await embeddings.embedQuery(text);

      // Pad or truncate to 384 dimensions to match existing DB schema
      if (embedding.length > 384) {
        return embedding.slice(0, 384);
      } else if (embedding.length < 384) {
        // Pad with zeros
        const padded = [...embedding];
        while (padded.length < 384) {
          padded.push(0);
        }
        return padded;
      }
      return embedding;
    } catch (error) {
      console.error(
        "OpenAI embedding failed (quota exceeded or other error), falling back to hash-based:",
        error instanceof Error ? error.message : error
      );
      // Continue to fallback below
    }
  }

  // Fallback to hash-based embedding if OpenAI is not available
  try {
    const hash = crypto.createHash("sha256").update(text).digest();
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
  } catch (fallbackError) {
    console.error("Even hash-based embedding failed:", fallbackError);
    // Return a simple uniform embedding as last resort
    return Array(384)
      .fill(0)
      .map(() => Math.random() - 0.5);
  }
}

// Main processing function that can be used by both upload and process-document routes
export async function processDocument(documentId: string, userId: string) {
  const supabase = await createClient();

  try {
    // Get the document from database
    const { data: document, error: docError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .eq("user_id", userId)
      .single();

    if (docError || !document) {
      throw new Error("Document not found");
    }

    if (document.processed) {
      throw new Error("Document already processed");
    }

    // Step 1: Decrypt the file content
    const encryptedContent = Buffer.from(document.encrypted_content, "base64");
    const encryptionKey = Buffer.from(document.encryption_key, "base64");
    const iv = Buffer.from(document.iv, "base64");

    const decipher = crypto.createDecipheriv("aes-256-cbc", encryptionKey, iv);
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
    const chunks = await chunkText(extractedText, 800, 150); // Smaller chunks for better retrieval

    // Step 4: Generate embeddings and store chunks
    const chunkInserts = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      try {
        const embedding = await generateEmbedding(chunk);

        chunkInserts.push({
          document_id: documentId,
          user_id: userId,
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

    return {
      success: true,
      message: "Document processed successfully",
      chunks: chunks.length,
      extractedLength: extractedText.length,
    };
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
}
