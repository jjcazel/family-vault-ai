import { createClient } from "@utils/supabase/server";
import { LlamaParseReader } from "llamaindex";
import "dotenv/config";
import {
  fetchDocument,
  insertChunks,
  updateDocumentStatus,
  updateDocumentError,
  DocumentRecord,
  DocumentChunkInsert,
} from "./document";
import crypto from "crypto";
import mammoth from "mammoth";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAIEmbeddings } from "@langchain/openai";
import { semanticChunkDocument } from "./chunking";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * Processes a document by decrypting its content, extracting text, chunking, generating embeddings, and updating the database.
 *
 * Steps:
 * 1. Fetches the document record for the given documentId and userId.
 * 2. Decrypts the document content using its encryption key and IV.
 * 3. Extracts text from the decrypted content, supporting PDF, Word, and plain text files.
 * 4. Chunks the extracted text using semantic chunking, with a fallback to character-based chunking.
 * 5. Generates embeddings for each chunk (using OpenAI or a hash-based fallback).
 * 6. Inserts the chunks and their embeddings into the database.
 * 7. Updates the document status and extracted text in the database.
 *
 * @param documentId - The unique identifier of the document to process.
 * @param userId - The unique identifier of the user who owns the document.
 * @returns An object containing success status, message, number of chunks, and extracted text length.
 * @throws If any step fails, updates the document error status and rethrows the error.
 */
export async function processDocument(documentId: string, userId: string) {
  const supabase = await createClient();
  try {
    const document = await fetchDocument(supabase, documentId, userId);
    const decryptedContent = decryptContent(document);
    const extractedText = await extractText(
      decryptedContent,
      document.content_type
    );
    let chunks: string[] = semanticChunkDocument(extractedText, 800).map(
      (chunk: { content: string }) => chunk.content
    );
    if (!chunks || chunks.length === 0) {
      // fallback: use chunkText, but wrap in metadata
      const fallbackChunks = await chunkText(extractedText, 800, 150);
      chunks = fallbackChunks;
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

// Extract text from different file types using specialized extractors
async function extractTextFromFile(
  buffer: Buffer,
  contentType: string
): Promise<string> {
  try {
    if (isPdf(contentType)) return await extractPdfText(buffer);
    if (isWord(contentType)) return await extractWordText(buffer);
    if (isPlainText(contentType)) return extractPlainText(buffer);
    throw new Error(`Unsupported file type: ${contentType}`);
  } catch (error) {
    throw new Error(
      `Text extraction failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

function isPdf(contentType: string): boolean {
  return contentType === "application/pdf";
}

function isWord(contentType: string): boolean {
  return contentType.includes("word") || contentType.includes("document");
}

function isPlainText(contentType: string): boolean {
  return contentType.includes("text");
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  // Try LlamaParseReader first, then pdf2json as fallback
  try {
    const reader = new LlamaParseReader({
      resultType: "text",
      apiKey: process.env.LLAMA_CLOUD_API_KEY,
    });
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
  // Fallback to pdf2json
  try {
    const PDFParser = (await import("pdf2json")).default;
    return await new Promise((resolve, reject) => {
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
            const cleanedText = extractedText
              .replace(/\s+/g, " ")
              .replace(/\n\s*\n/g, "\n\n")
              .trim();
            resolve(cleanedText);
          } else {
            reject(new Error("No text content found with pdf2json"));
          }
        } catch (parseErr) {
          reject(parseErr);
        }
      });
      pdfParser.parseBuffer(buffer);
    });
  } catch {
    return "PDF text extraction failed with LlamaParse and pdf2json. This PDF may be image-based or have a complex format. Please try converting it to a text file or use a different PDF.";
  }
}

async function extractWordText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

function extractPlainText(buffer: Buffer): string {
  return buffer.toString("utf-8");
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
