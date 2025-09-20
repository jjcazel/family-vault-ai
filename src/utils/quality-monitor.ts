/**
 * Quality monitoring system for document processing pipeline
 * Based on enterprise LLM training data quality practices
 */

export interface ChunkQualityMetrics {
  chunkId: string;
  length: number;
  wordCount: number;
  sentenceCount: number;
  vocabularyRichness: number;
  informationDensity: number;
  structuralScore: number;
  embeddingQuality?: number;
}

export interface DocumentQualityMetrics {
  documentId: string;
  extractionMethod: string;
  totalChunks: number;
  avgChunkLength: number;
  avgWordCount: number;
  totalWords: number;
  qualityScore: number;
  extractionConfidence: number;
  processingTime: number;
}

export class QualityMonitor {
  /**
   * Evaluate chunk quality - used in enterprise LLM pipelines
   */
  static evaluateChunk(chunk: string, chunkId: string): ChunkQualityMetrics {
    const words = chunk.split(/\s+/).filter((w) => w.length > 0);
    const sentences = chunk.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const uniqueWords = new Set(words.map((w) => w.toLowerCase()));

    // Vocabulary richness: unique words / total words
    const vocabularyRichness = uniqueWords.size / Math.max(words.length, 1);

    // Information density: meaningful content ratio
    const meaningfulWords = words.filter(
      (w) =>
        w.length > 2 &&
        !/^(the|and|or|but|in|on|at|to|for|of|with|by|a|an)$/i.test(w)
    );
    const informationDensity =
      meaningfulWords.length / Math.max(words.length, 1);

    // Structural score: proper sentences and formatting
    const avgSentenceLength = words.length / Math.max(sentences.length, 1);
    const structuralScore = this.calculateStructuralScore(
      chunk,
      avgSentenceLength
    );

    return {
      chunkId,
      length: chunk.length,
      wordCount: words.length,
      sentenceCount: sentences.length,
      vocabularyRichness,
      informationDensity,
      structuralScore,
    };
  }

  /**
   * Evaluate document-level quality metrics
   */
  static evaluateDocument(
    chunks: string[],
    documentId: string,
    extractionMethod: string,
    processingStartTime: number
  ): DocumentQualityMetrics {
    const chunkMetrics = chunks.map((chunk, i) =>
      this.evaluateChunk(chunk, `${documentId}_${i}`)
    );

    const totalWords = chunkMetrics.reduce((sum, m) => sum + m.wordCount, 0);
    const avgChunkLength =
      chunkMetrics.reduce((sum, m) => sum + m.length, 0) / chunks.length;
    const avgWordCount = totalWords / chunks.length;

    // Overall quality score (0-1)
    const avgVocabRichness =
      chunkMetrics.reduce((sum, m) => sum + m.vocabularyRichness, 0) /
      chunks.length;
    const avgInfoDensity =
      chunkMetrics.reduce((sum, m) => sum + m.informationDensity, 0) /
      chunks.length;
    const avgStructural =
      chunkMetrics.reduce((sum, m) => sum + m.structuralScore, 0) /
      chunks.length;

    const qualityScore =
      avgVocabRichness * 0.3 + avgInfoDensity * 0.4 + avgStructural * 0.3;

    return {
      documentId,
      extractionMethod,
      totalChunks: chunks.length,
      avgChunkLength,
      avgWordCount,
      totalWords,
      qualityScore,
      extractionConfidence: this.calculateExtractionConfidence(
        qualityScore,
        chunks.length
      ),
      processingTime: Date.now() - processingStartTime,
    };
  }

  /**
   * Monitor embedding quality by checking for outliers and clustering
   */
  static async evaluateEmbeddingQuality(embeddings: number[][]): Promise<{
    avgMagnitude: number;
    outlierCount: number;
    dimensionality: number;
    coherenceScore: number;
  }> {
    if (embeddings.length === 0) {
      return {
        avgMagnitude: 0,
        outlierCount: 0,
        dimensionality: 0,
        coherenceScore: 0,
      };
    }

    const dimensionality = embeddings[0].length;

    // Calculate magnitudes
    const magnitudes = embeddings.map((emb) =>
      Math.sqrt(emb.reduce((sum, val) => sum + val * val, 0))
    );
    const avgMagnitude =
      magnitudes.reduce((sum, mag) => sum + mag, 0) / magnitudes.length;

    // Detect outliers (embeddings significantly different from average)
    const stdDev = Math.sqrt(
      magnitudes.reduce(
        (sum, mag) => sum + Math.pow(mag - avgMagnitude, 2),
        0
      ) / magnitudes.length
    );
    const outlierThreshold = avgMagnitude + 2 * stdDev;
    const outlierCount = magnitudes.filter(
      (mag) => mag > outlierThreshold || mag < avgMagnitude - 2 * stdDev
    ).length;

    // Coherence: how similar embeddings are to each other (good chunks should be reasonably similar)
    let totalSimilarity = 0;
    let comparisons = 0;

    for (let i = 0; i < embeddings.length; i++) {
      for (let j = i + 1; j < Math.min(embeddings.length, i + 5); j++) {
        const similarity = this.cosineSimilarity(embeddings[i], embeddings[j]);
        totalSimilarity += similarity;
        comparisons++;
      }
    }

    const coherenceScore = comparisons > 0 ? totalSimilarity / comparisons : 0;

    return {
      avgMagnitude,
      outlierCount,
      dimensionality,
      coherenceScore,
    };
  }

  /**
   * Generate quality report for logging/monitoring
   */
  static generateQualityReport(
    docMetrics: DocumentQualityMetrics,
    embeddingMetrics: {
      avgMagnitude: number;
      outlierCount: number;
      coherenceScore: number;
    }
  ): string {
    const issues: string[] = [];

    if (docMetrics.qualityScore < 0.3) issues.push("Low text quality");
    if (docMetrics.avgChunkLength < 100) issues.push("Chunks too short");
    if (docMetrics.avgChunkLength > 2000) issues.push("Chunks too long");
    if (embeddingMetrics.outlierCount > docMetrics.totalChunks * 0.2)
      issues.push("Many embedding outliers");
    if (embeddingMetrics.coherenceScore < 0.1)
      issues.push("Low embedding coherence");

    return `
[QUALITY REPORT] Document: ${docMetrics.documentId}
- Extraction Method: ${docMetrics.extractionMethod}
- Quality Score: ${docMetrics.qualityScore.toFixed(3)} (${
      docMetrics.qualityScore > 0.5 ? "GOOD" : "POOR"
    })
- Chunks: ${docMetrics.totalChunks} (avg: ${docMetrics.avgChunkLength.toFixed(
      0
    )} chars)
- Words: ${docMetrics.totalWords} (avg: ${docMetrics.avgWordCount.toFixed(
      0
    )} per chunk)
- Processing Time: ${docMetrics.processingTime}ms
- Embedding Coherence: ${embeddingMetrics.coherenceScore.toFixed(3)}
- Issues: ${issues.length > 0 ? issues.join(", ") : "None detected"}
`.trim();
  }

  private static calculateStructuralScore(
    chunk: string,
    avgSentenceLength: number
  ): number {
    let score = 0.5; // Base score

    // Good sentence length (8-20 words)
    if (avgSentenceLength >= 8 && avgSentenceLength <= 20) score += 0.2;

    // Has proper punctuation
    if (/[.!?]/.test(chunk)) score += 0.1;

    // Has paragraph breaks or structure
    if (/\n/.test(chunk) || chunk.length > 200) score += 0.1;

    // Not mostly numbers or special characters
    const alphaRatio = (chunk.match(/[a-zA-Z]/g) || []).length / chunk.length;
    if (alphaRatio > 0.6) score += 0.1;

    return Math.min(1.0, score);
  }

  private static calculateExtractionConfidence(
    qualityScore: number,
    chunkCount: number
  ): number {
    let confidence = qualityScore;

    // Boost confidence for reasonable chunk counts
    if (chunkCount >= 2 && chunkCount <= 50) confidence += 0.1;
    if (chunkCount === 1) confidence -= 0.2; // Single chunk might indicate poor extraction

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  private static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude ? dotProduct / magnitude : 0;
  }
}

/**
 * Enterprise-grade PDF extraction strategies
 */
export const EXTRACTION_STRATEGIES = {
  /**
   * How OpenAI, Anthropic etc. handle PDFs for training data
   */
  ENTERPRISE_APPROACH: `
1. **Multi-Method Extraction**: Try 3-5 different parsers
   - LlamaParse (layout-aware)
   - pdf2json (fast text extraction) 
   - pdfplumber (tables/structures)
   - Tesseract OCR (scanned docs)
   - Adobe PDF SDK (enterprise)

2. **Quality Scoring**: Each method gets a confidence score
   - Text length vs file size ratio
   - Structural coherence (sentences, paragraphs)
   - Information density (meaningful vs filler words)
   - Format detection (tables, forms, etc.)

3. **Intelligent Selection**: Choose best extraction based on:
   - Quality metrics
   - Document type detection
   - Confidence scores
   - Content validation

4. **Chunking Strategy**: 
   - Semantic chunking (preserve meaning)
   - Sliding window fallback
   - Format-aware chunking (tables, lists)
   - Overlap optimization

5. **Embedding Quality Control**:
   - Outlier detection
   - Similarity clustering
   - Dimensionality validation
   - Zero-vector detection
  `,

  /**
   * Document types and best extraction methods
   */
  DOCUMENT_TYPE_STRATEGIES: {
    "tax-documents": "LlamaParse + OCR fallback (forms, tables)",
    resumes: "pdf2json + layout detection (formatted text)",
    contracts: "LlamaParse + structure preservation (legal formatting)",
    scanned: "OCR primary + text verification",
    academic: "pdfplumber + reference extraction",
    financial: "LlamaParse + table extraction + OCR",
  },
};
