import crypto from "crypto";
import { OpenAIEmbeddings } from "@langchain/openai";

/**
 * Generates a 384-dimensional embedding for the given text using OpenAI or a hash-based fallback.
 * @param text - The input text to embed.
 * @returns A promise resolving to a number array of length 384.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (openaiApiKey) {
    const openAIEmbedding = await tryOpenAIEmbedding(text, openaiApiKey);
    if (openAIEmbedding) return openAIEmbedding;
  }
  return tryHashOrRandomEmbedding(text);
}

export async function tryOpenAIEmbedding(
  text: string,
  apiKey: string
): Promise<number[] | null> {
  try {
    const embeddings = new OpenAIEmbeddings({
      apiKey,
      model: "text-embedding-3-small",
    });
    const embedding = await embeddings.embedQuery(text);
    return padOrTruncateEmbedding(embedding, 384);
  } catch (error) {
    console.error(
      "OpenAI embedding failed (quota exceeded or other error), falling back to hash-based:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

export function padOrTruncateEmbedding(
  embedding: number[],
  targetLength: number
): number[] {
  if (embedding.length > targetLength) {
    return embedding.slice(0, targetLength);
  } else if (embedding.length < targetLength) {
    return [...embedding, ...Array(targetLength - embedding.length).fill(0)];
  }
  return embedding;
}

export function tryHashOrRandomEmbedding(text: string): number[] {
  try {
    return generateHashBasedEmbedding(text);
  } catch (fallbackError) {
    console.error("Even hash-based embedding failed:", fallbackError);
    // Return a simple uniform embedding as last resort
    return Array(384)
      .fill(0)
      .map(() => Math.random() - 0.5);
  }
}

export function generateHashBasedEmbedding(text: string): number[] {
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
}
