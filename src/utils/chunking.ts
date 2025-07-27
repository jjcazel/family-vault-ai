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
  console.log("[chunking] Using semanticChunkDocument");
  if (!text || text.trim().length === 0) {
    return [];
  }

  const headingMatches = findHeadings(text);
  if (headingMatches.length === 0) {
    return chunkTextBySize(text, maxChunkSize);
  }

  const sections = extractSections(text, headingMatches);
  return chunkSectionContentsBySize(sections, maxChunkSize);
}

/**
 * Finds headings in the text using a regex pattern.
 */
function findHeadings(text: string): { heading: string; index: number }[] {
  // Improved: Only match headings at the start of a line
  const headingPattern = /^(.*?:|[A-Z][A-Z \-]{2,40}$|\d+\.\s.*$)/gm;
  const matches: { heading: string; index: number }[] = [];
  let match;
  while ((match = headingPattern.exec(text)) !== null) {
    matches.push({ heading: match[0].trim(), index: match.index });
  }
  return matches;
}

/**
 * Splits text into fixed-size, trimmed, non-empty chunks.
 * Returns array of { heading: null, content } objects.
 * Optimized for large documents: avoids regex for very large text.
 */
function chunkTextBySize(
  text: string,
  maxChunkSize: number
): { heading: string | null; content: string }[] {
  if (text.length === 0) return [];
  const result: { heading: string | null; content: string }[] = [];
  let i = 0;
  while (i < text.length) {
    const chunk = text.slice(i, i + maxChunkSize).trim();
    if (chunk.length > 0) {
      result.push({ heading: null, content: chunk });
    }
    i += maxChunkSize;
  }
  return result;
}

/**
 * Extracts sections from text based on heading matches.
 */
function extractSections(
  text: string,
  headingMatches: { heading: string; index: number }[]
): { heading: string; content: string }[] {
  const sections: { heading: string; content: string }[] = [];
  for (let i = 0; i < headingMatches.length; i++) {
    const start = headingMatches[i].index + headingMatches[i].heading.length;
    const end =
      i + 1 < headingMatches.length ? headingMatches[i + 1].index : text.length;
    // Remove leading/trailing newlines and whitespace
    const content = text
      .slice(start, end)
      .replace(/^\s*\n+|\n+\s*$/g, "")
      .trim();
    // Always push the section, even if content is short or empty
    sections.push({ heading: headingMatches[i].heading, content });
  }
  return sections;
}

/**
 * Splits each section's content by size, preserving headings and further splitting large sections.
 * Returns array of { heading, content } objects.
 * Optimized for large sections: avoids regex for very large text.
 */
function chunkSectionContentsBySize(
  sections: { heading: string; content: string }[],
  maxChunkSize: number
): { heading: string; content: string }[] {
  return sections.flatMap((section) => chunkSection(section, maxChunkSize));
}

function chunkSection(
  section: { heading: string; content: string },
  maxChunkSize: number
): { heading: string; content: string }[] {
  if (section.content.length === 0) {
    // Still include empty sections for test expectations
    return [{ heading: section.heading, content: section.content }];
  }
  if (section.content.length > maxChunkSize) {
    return splitLargeSection(section, maxChunkSize);
  }
  return [{ heading: section.heading, content: section.content }];
}

function splitLargeSection(
  section: { heading: string; content: string },
  maxChunkSize: number
): { heading: string; content: string }[] {
  const chunks: { heading: string; content: string }[] = [];
  let i = 0;
  while (i < section.content.length) {
    const chunk = section.content.slice(i, i + maxChunkSize);
    chunks.push({ heading: section.heading, content: chunk });
    i += maxChunkSize;
  }
  return chunks;
}
