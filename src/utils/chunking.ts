/**
 * Splits a document into semantic chunks based on detected headings and a maximum chunk size.
 * Returns an array of objects with { heading, content } for each chunk.
 *
 * @param text - The input document as a string.
 * @param maxChunkSize - The maximum size (in characters) for each chunk. Default is 1000.
 * @returns An array of chunk objects: { heading: string | null, content: string }
 */
export function semanticChunkDocument(
  text: string,
  maxChunkSize: number = 1000,
  overlap?: number
): { heading: string | null; content: string }[] {
  if (typeof text !== "string") return [];
  return chunkTextBySize(text, maxChunkSize, overlap ?? 50);
}

// Sentence/bullet-aware chunking with overlap, fallback to char-based chunking
function chunkTextBySize(
  text: string,
  maxChunkSize: number,
  overlap: number = 0
): { heading: string | null; content: string }[] {
  if (typeof text !== "string" || text.length === 0) return [];

  // Try to split by bullets first
  const bulletRegex = /(?:^|\n)[\-*•]\s+/g;
  if (bulletRegex.test(text)) {
    const bullets = text
      .split(bulletRegex)
      .map((b) => b.trim())
      .filter(Boolean);
    return chunkUnitsWithOverlap(bullets, maxChunkSize, overlap);
  }

  // Try to split by sentences
  const sentenceRegex = /(?<=[.!?])\s+(?=[A-Z])/g;
  const sentences = text
    .split(sentenceRegex)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length > 1) {
    return chunkUnitsWithOverlap(sentences, maxChunkSize, overlap);
  }

  // Fallback: char-based chunking
  const result: { heading: string | null; content: string }[] = [];
  let i = 0;
  while (i < text.length) {
    const chunk = text.slice(i, i + maxChunkSize).trim();
    if (chunk.length > 0) {
      result.push({ heading: null, content: chunk });
    }
    i += maxChunkSize - overlap;
  }
  return result;
}

function getOverlapChunk(lastChunk: string): string {
  // Extract the last sentence or line for overlap
  return lastChunk.split(/(?<=[.!?])\s+|\n/).slice(-1)[0] || "";
}

function chunkUnitsWithOverlap(
  units: string[],
  maxChunkSize: number,
  overlap: number = 0
): { heading: string | null; content: string }[] {
  const chunks: { heading: string | null; content: string }[] = [];
  let current = "";

  function flushCurrentChunk() {
    if (current.trim()) {
      chunks.push({ heading: null, content: current.trim() });
      current = "";
    }
  }

  function pushUnitAsChunk(unit: string) {
    chunks.push({ heading: null, content: unit.trim() });
    current = "";
  }

  for (const unit of units) {
    const next = current ? current + " " + unit : unit;

    // If current is empty and unit itself is too large, push as its own chunk
    if (!current && next.length > maxChunkSize) {
      pushUnitAsChunk(unit);
      continue;
    }

    // If next chunk would exceed maxChunkSize, flush current chunk
    if (next.length > maxChunkSize) {
      flushCurrentChunk();
      if (overlap > 0 && chunks.length > 0) {
        current = getOverlapChunk(chunks[chunks.length - 1].content);
      }
      // After overlap, check if unit still doesn't fit
      const overlappedNext = current ? current + " " + unit : unit;
      if (overlappedNext.length > maxChunkSize) {
        pushUnitAsChunk(unit);
        continue;
      }
    }
    // Add unit to current chunk
    current = current ? current + " " + unit : unit;
  }

  // Flush any remaining chunk
  if (current.trim()) {
    chunks.push({ heading: null, content: current.trim() });
  }
  return chunks;
}
