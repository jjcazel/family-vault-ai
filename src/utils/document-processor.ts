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
import { generateEmbedding } from "./embedding";
import { QualityMonitor } from "./quality-monitor";
import crypto from "crypto";
import mammoth from "mammoth";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
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
  const processingStartTime = Date.now();

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

    // Quality monitoring - Enterprise approach
    const extractionMethod =
      document.content_type === "application/pdf"
        ? "intelligent-pdf"
        : "standard";
    const qualityMetrics = QualityMonitor.evaluateDocument(
      chunks,
      documentId,
      extractionMethod,
      processingStartTime
    );

    const chunkInserts = await generateChunkEmbeddings(
      chunks,
      documentId,
      userId
    );

    // Monitor embedding quality
    const embeddings = chunkInserts.map((chunk) => JSON.parse(chunk.embedding));
    const embeddingMetrics = await QualityMonitor.evaluateEmbeddingQuality(
      embeddings
    );

    // Generate and log quality report
    const qualityReport = QualityMonitor.generateQualityReport(
      qualityMetrics,
      embeddingMetrics
    );
    console.log(qualityReport);

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
  // Try both methods in parallel for comparison
  const [llamaResult, pdf2jsonResult] = await Promise.allSettled([
    tryLlamaParsePdf(buffer),
    tryPdf2JsonExtract(buffer),
  ]);

  let llamaText: string | null = null;
  let pdf2jsonText: string | null = null;

  if (llamaResult.status === "fulfilled") {
    llamaText = llamaResult.value;
  }

  if (pdf2jsonResult.status === "fulfilled") {
    pdf2jsonText = pdf2jsonResult.value;
  }

  // If both failed, return error
  if (!llamaText && !pdf2jsonText) {
    return (
      "PDF text extraction failed with LlamaParse and pdf2json. This PDF may be image-based or have a complex format. " +
      "Please try converting it to a text file or use a different PDF."
    );
  }

  // If only one succeeded, use it
  if (llamaText && !pdf2jsonText) {
    return llamaText;
  }

  if (pdf2jsonText && !llamaText) {
    return pdf2jsonText;
  }

  // Both succeeded - choose the better one using quality heuristics
  const bestResult = chooseBestExtraction(
    llamaText!,
    pdf2jsonText!,
    buffer.length
  );
  console.log(
    `[PROCESSING] ✅ Both methods succeeded, chose ${bestResult.method} (${
      bestResult.text.length
    } chars, score: ${bestResult.score.toFixed(3)})`
  );

  return bestResult.text;
}

/**
 * Choose the best extraction result using quality heuristics
 * Based on enterprise LLM training data selection criteria
 */
function chooseBestExtraction(
  llamaText: string,
  pdf2jsonText: string,
  originalFileSize: number
): { text: string; method: string; score: number } {
  const llamaScore = calculateExtractionQuality(
    llamaText,
    originalFileSize,
    "LlamaParse"
  );
  const pdf2jsonScore = calculateExtractionQuality(
    pdf2jsonText,
    originalFileSize,
    "pdf2json"
  );

  console.log(
    `[PROCESSING] Quality comparison - LlamaParse: ${llamaScore.toFixed(
      3
    )}, pdf2json: ${pdf2jsonScore.toFixed(3)}`
  );

  if (llamaScore > pdf2jsonScore) {
    return { text: llamaText, method: "LlamaParse", score: llamaScore };
  } else {
    return { text: pdf2jsonText, method: "pdf2json", score: pdf2jsonScore };
  }
}

/**
 * Calculate extraction quality score (0-1) based on enterprise criteria
 */
function calculateExtractionQuality(
  text: string,
  originalFileSize: number,
  method: string
): number {
  let score = 0;

  // 1. Text length vs file size ratio (more text = better)
  const textToSizeRatio = text.length / (originalFileSize / 1000); // chars per KB
  const lengthScore = Math.min(1.0, textToSizeRatio / 50); // Normalize to 50 chars/KB as baseline
  score += lengthScore * 0.3;

  // 2. Text structure quality
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const avgWordsPerSentence = words.length / Math.max(sentences.length, 1);

  // Good sentence structure (8-25 words per sentence)
  const structureScore =
    avgWordsPerSentence >= 8 && avgWordsPerSentence <= 25
      ? 1.0
      : avgWordsPerSentence >= 4 && avgWordsPerSentence <= 40
      ? 0.7
      : 0.3;
  score += structureScore * 0.25;

  // 3. Vocabulary richness (unique words / total words)
  const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
  const vocabularyRichness = uniqueWords.size / Math.max(words.length, 1);
  score += vocabularyRichness * 0.2;

  // 4. Content density (meaningful vs filler words)
  const meaningfulWords = words.filter(
    (w) =>
      w.length > 2 &&
      !/^(the|and|or|but|in|on|at|to|for|of|with|by|a|an|is|are|was|were)$/i.test(
        w
      )
  );
  const contentDensity = meaningfulWords.length / Math.max(words.length, 1);
  score += contentDensity * 0.15;

  // 5. Method-specific bonuses
  if (method === "LlamaParse") {
    // LlamaParse bonus for structured content (tables, forms)
    if (/\|.*\|/.test(text) || text.includes("\t")) score += 0.05;
    // Penalty for very short extractions (LlamaParse should extract more)
    if (text.length < 500) score -= 0.1;
  } else if (method === "pdf2json") {
    // pdf2json bonus for consistent formatting
    const lineBreaks = (text.match(/\n/g) || []).length;
    if (lineBreaks > 0 && lineBreaks < text.length / 100) score += 0.05;
  }

  // 6. Minimum quality threshold
  if (text.length < 100) score = Math.min(score, 0.2);

  return Math.max(0, Math.min(1, score));
}

async function tryLlamaParsePdf(buffer: Buffer): Promise<string | null> {
  let tmpFile: string | null = null;
  try {
    const reader = new LlamaParseReader({
      resultType: "text",
      apiKey: process.env.LLAMA_CLOUD_API_KEY,
    });
    const tmpDir = os.tmpdir();
    tmpFile = path.join(tmpDir, `llamaparse_${Date.now()}.pdf`);
    fs.writeFileSync(tmpFile, buffer);
    const documents = await reader.loadData(tmpFile);
    fs.unlinkSync(tmpFile);
    if (
      documents?.length &&
      documents[0].text &&
      documents[0].text.trim().length > 0
    ) {
      return documents[0].text.trim();
    }
    return null;
  } catch (llamaErr) {
    console.error("[LlamaParse] Error:", llamaErr);
    return null;
  } finally {
    if (tmpFile && fs.existsSync(tmpFile)) {
      try {
        fs.unlinkSync(tmpFile);
      } catch (unlinkErr) {
        console.error("[LlamaParse] Cleanup error:", unlinkErr);
      }
    }
  }
}

// Helper to flatten pdf2json parsed data into a single text string
function flattenPdf2JsonText(data: {
  Pages?: Array<{
    Texts?: Array<{ R?: Array<{ T?: string }> }>;
  }>;
}): string {
  if (!data.Pages || !Array.isArray(data.Pages)) return "";
  return data.Pages.flatMap((page) =>
    Array.isArray(page.Texts)
      ? page.Texts.flatMap((textItem) =>
          Array.isArray(textItem.R)
            ? textItem.R.map((run) => (run.T ? decodeURIComponent(run.T) : ""))
            : []
        )
      : []
  ).join(" ");
}

// Process extracted PDF text
function processPdf2JsonText(extractedText: string): string {
  return extractedText
    .replace(/\s+/g, " ")
    .replace(/\n\s*\n/g, "\n\n")
    .trim();
}

// Handle PDF data processing
function handlePdf2JsonData(pdfData: unknown): string {
  const data = pdfData as {
    Pages?: Array<{
      Texts?: Array<{ R?: Array<{ T?: string }> }>;
    }>;
  };

  const extractedText = flattenPdf2JsonText(data);
  if (extractedText.trim().length === 0) {
    throw new Error("No text content found with pdf2json");
  }

  return processPdf2JsonText(extractedText);
}

async function tryPdf2JsonExtract(buffer: Buffer): Promise<string | null> {
  try {
    // Dynamic import: loads pdf2json only when needed to reduce initial bundle size and memory usage.
    // This is useful for large/rarely-used modules in serverless or edge environments.
    const PDFParser = (await import("pdf2json")).default;
    return await new Promise((resolve, reject) => {
      const pdfParser = new PDFParser();

      pdfParser.on("pdfParser_dataError", (errData: unknown) => {
        reject(new Error(`PDF parsing error: ${errData}`));
      });

      pdfParser.on("pdfParser_dataReady", (pdfData: unknown) => {
        try {
          const cleanedText = handlePdf2JsonData(pdfData);
          resolve(cleanedText);
        } catch (parseErr) {
          reject(
            new Error(
              `PDF parsing failed: ${
                parseErr instanceof Error ? parseErr.message : String(parseErr)
              }`
            )
          );
        }
      });

      pdfParser.parseBuffer(buffer);
    });
  } catch (err) {
    console.error("[pdf2json] Error:", err);
    return null;
  }
}

async function extractWordText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

function extractPlainText(buffer: Buffer): string {
  return buffer.toString("utf-8");
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
  const embeddingPromises = chunks.map(async (chunk, i) => {
    try {
      const embedding = await generateEmbedding(chunk);
      return {
        document_id: documentId,
        user_id: userId,
        chunk_index: i,
        content: chunk,
        token_count: Math.ceil(chunk.length / 4),
        embedding: `[${embedding.join(",")}]`,
      };
    } catch (embeddingError) {
      throw new Error(
        `Failed to generate embedding for chunk ${i + 1}: ${
          embeddingError instanceof Error
            ? embeddingError.message
            : "Unknown error"
        }`
      );
    }
  });

  return Promise.all(embeddingPromises);
}
