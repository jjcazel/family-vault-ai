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
  maxChunkSize: number = 1000
): { heading: string | null; content: string }[] {
  return chunkTextBySize(text, maxChunkSize, 50);
}

// Sentence/bullet-aware chunking with overlap, fallback to char-based chunking
function chunkTextBySize(
  text: string,
  maxChunkSize: number,
  overlap: number = 0
): { heading: string | null; content: string }[] {
  if (text.length === 0) return [];

  // Try to split by bullets first
  const bulletRegex = /(?:^|\n)[\-*•]\s+/g;
  if (bulletRegex.test(text)) {
    const bullets = text
      .split(bulletRegex)
      .map((b) => b.trim())
      .filter(Boolean);
    return groupAndChunkByUnitsSimple(bullets, maxChunkSize, overlap);
  }

  // Try to split by sentences
  const sentenceRegex = /(?<=[.!?])\s+(?=[A-Z])/g;
  const sentences = text
    .split(sentenceRegex)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length > 1) {
    return groupAndChunkByUnitsSimple(sentences, maxChunkSize, overlap);
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

function groupAndChunkByUnitsSimple(
  units: string[],
  maxChunkSize: number,
  overlap: number = 0
): { heading: string | null; content: string }[] {
  const chunks: { heading: string | null; content: string }[] = [];
  let current = "";
  let i = 0;
  while (i < units.length) {
    const unit = units[i];
    if ((current + (current ? " " : "") + unit).length > maxChunkSize) {
      if (current) {
        chunks.push({ heading: null, content: current.trim() });
        // Overlap: include last unit in next chunk
        if (overlap > 0 && chunks.length > 0) {
          current =
            chunks[chunks.length - 1].content
              .split(/(?<=[.!?])\s+|\n/)
              .slice(-1)[0] || "";
        } else {
          current = "";
        }
      }
    }
    current += (current ? " " : "") + unit;
    i++;
  }
  if (current.trim()) {
    chunks.push({ heading: null, content: current.trim() });
  }
  return chunks;
}
