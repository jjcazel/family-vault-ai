import { createClient } from "@utils/supabase/server";
import { LlamaParseReader } from "llamaindex";
import "dotenv/config";
import type { SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";
import mammoth from "mammoth";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAIEmbeddings } from "@langchain/openai";

// Semantic chunking for any document: split by headings, then further chunk large sections
function semanticChunkDocument(
  text: string,
  maxChunkSize: number = 1000
): string[] {
  // Regex for headings: lines that start with 1-3 words followed by a colon, or all caps, or numbered sections
  const headingRegex =
    /(?:^|\n)([A-Z][A-Za-z0-9 \-]{1,40}:|^[A-Z][A-Z \-]{2,40}$|^\d+\.\s.*$)/gm;
  // Split by headings
  const sections = text
    .split(headingRegex)
    .map((s) => s.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  for (const section of sections) {
    // If section is large, further chunk it using default chunker
    if (section.length > maxChunkSize * 1.5) {
      // Use default chunker for large sections
      chunks.push(
        ...(section.match(new RegExp(`.{1,${maxChunkSize}}`, "g")) || [])
      );
    } else if (section.length > 50) {
      chunks.push(section);
    }
  }
  return chunks;
}

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
      // Try LlamaParseReader first, then pdf2json as fallback
      try {
        const reader = new LlamaParseReader({
          resultType: "text",
          apiKey: process.env.LLAMA_CLOUD_API_KEY,
        });
        // Save buffer to a temp file for LlamaParseReader
        const fs = await import("fs");
        const os = await import("os");
        const path = await import("path");
        const tmpDir = os.tmpdir();
        const tmpFile = path.join(tmpDir, `llamaparse_${Date.now()}.pdf`);
        fs.writeFileSync(tmpFile, buffer);
        console.log(`[LlamaParse] Parsing PDF file: ${tmpFile}`);
        const documents = await reader.loadData(tmpFile);
        fs.unlinkSync(tmpFile);
        if (documents && documents.length > 0) {
          console.log(
            `[LlamaParse] Parsed document result:`,
            documents[0].text?.substring(0, 500)
          );
        }
        if (
          documents &&
          documents.length > 0 &&
          documents[0].text &&
          documents[0].text.trim().length > 0
        ) {
          return documents[0].text.trim();
        }
        // If LlamaParseReader fails, fall through to pdf2json
      } catch (llamaErr) {
        console.error("[LlamaParse] Error:", llamaErr);
        // Ignore and try pdf2json
      }
      try {
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
        return "PDF text extraction failed with LlamaParse and pdf2json. This PDF may be image-based or have a complex format. Please try converting it to a text file or use a different PDF.";
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
    console.log(
      "Using OpenAI embeddings for text:",
      text.substring(0, 50) + "..."
    );
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
    console.log(
      "Using hash-based embedding for text:",
      text.substring(0, 50) + "..."
    );
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
    const document = await fetchDocument(supabase, documentId, userId);
    const decryptedContent = decryptContent(document);
    const extractedText = await extractText(
      decryptedContent,
      document.content_type
    );
    let chunks: string[] = semanticChunkDocument(extractedText, 800);
    if (!chunks || chunks.length === 0) {
      chunks = await chunkText(extractedText, 800, 150);
    }
    const chunkInserts = await generateChunkEmbeddings(
      chunks,
      documentId,
      userId
    );
    await insertChunks(supabase, chunkInserts);
    await updateDocumentStatus(supabase, documentId, extractedText);
    return {
      success: true,
      message: "Document processed successfully",
      chunks: chunks.length,
      extractedLength: extractedText.length,
    };
  } catch (processingError) {
    await updateDocumentError(
      await createClient(),
      documentId,
      processingError
    );
    throw processingError;
  }
}
// --- Helper Functions grouped below ---
type DocumentRecord = {
  id: string;
  user_id: string;
  processed: boolean;
  encrypted_content: string;
  encryption_key: string;
  iv: string;
  content_type: string;
  [key: string]: unknown;
};

async function fetchDocument(
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

function decryptContent(document: DocumentRecord): Buffer {
  const encryptedContent = Buffer.from(document.encrypted_content, "base64");
  const encryptionKey = Buffer.from(document.encryption_key, "base64");
  const iv = Buffer.from(document.iv, "base64");
  const decipher = crypto.createDecipheriv("aes-256-cbc", encryptionKey, iv);
  return Buffer.concat([decipher.update(encryptedContent), decipher.final()]);
}

async function extractText(
  decryptedContent: Buffer,
  contentType: string
): Promise<string> {
  let extractedText = await extractTextFromFile(decryptedContent, contentType);
  if (!extractedText || extractedText.trim().length === 0) {
    throw new Error("No text could be extracted from the document");
  }
  // Normalize text: collapse multiple spaces, fix punctuation spacing
  extractedText = extractedText
    .replace(/\s+/g, " ") // Collapse multiple spaces
    .replace(/ ([.,;:!])/g, "$1") // Remove space before punctuation
    .trim();

  // If most 'words' are single characters, collapse spaces between letters
  const charWords = extractedText
    .split(" ")
    .filter((w) => w.length === 1).length;
  if (charWords > extractedText.split(" ").length * 0.5) {
    extractedText = extractedText.replace(/(\w)\s(?=\w)/g, "$1");
    extractedText = extractedText.replace(/\s+/g, " ").trim();
  }
  return extractedText;
}

type DocumentChunkInsert = {
  document_id: string;
  user_id: string;
  chunk_index: number;
  content: string;
  token_count: number;
  embedding: string;
};

async function generateChunkEmbeddings(
  chunks: string[],
  documentId: string,
  userId: string
): Promise<DocumentChunkInsert[]> {
  const chunkInserts: DocumentChunkInsert[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    try {
      const embedding = await generateEmbedding(chunk);
      chunkInserts.push({
        document_id: documentId,
        user_id: userId,
        chunk_index: i,
        content: chunk,
        token_count: Math.ceil(chunk.length / 4),
        embedding: `[${embedding.join(",")}]`,
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
  return chunkInserts;
}

async function insertChunks(
  supabase: SupabaseClient,
  chunkInserts: DocumentChunkInsert[]
): Promise<void> {
  const { error } = await supabase.from("document_chunks").insert(chunkInserts);
  if (error) {
    throw new Error(`Failed to store document chunks: ${error.message}`);
  }
}

async function updateDocumentStatus(
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

async function updateDocumentError(
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
