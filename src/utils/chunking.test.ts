import { semanticChunkDocument } from "./chunking";

describe("semanticChunkDocument", () => {
  it("chunks plain text by character count", () => {
    const text = "a".repeat(2500);
    const chunks = semanticChunkDocument(text, 1000);
    expect(chunks.length).toBe(3);
    expect(chunks[0].content.length).toBe(1000);
    expect(chunks[1].content.length).toBe(1000);
    expect(chunks[2].content.length).toBe(600);
    expect(chunks.every((c) => c.heading === null)).toBe(true);
  });

  it("chunks by bullets if present", () => {
    const text = "- Bullet one\n- Bullet two\n- Bullet three";
    const chunks = semanticChunkDocument(text, 1000);
    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toContain("Bullet one");
    expect(chunks[0].content).toContain("Bullet two");
    expect(chunks[0].content).toContain("Bullet three");
  });
  it("returns empty array for empty input", () => {
    expect(semanticChunkDocument("")).toEqual([]);
  });

  it("returns empty array for null, undefined, or non-string input", () => {
    // @ts-expect-error: intentionally passing non-string input for coverage
    expect(semanticChunkDocument(null)).toEqual([]);
    // @ts-expect-error: intentionally passing non-string input for coverage
    expect(semanticChunkDocument(undefined)).toEqual([]);
    // @ts-expect-error: intentionally passing non-string input for coverage
    expect(semanticChunkDocument(123)).toEqual([]);
    // @ts-expect-error: intentionally passing non-string input for coverage
    expect(semanticChunkDocument([])).toEqual([]);
  });

  it("chunks plain text by character count", () => {
    const text = "a".repeat(2500);
    const chunks = semanticChunkDocument(text, 1000);
    expect(chunks.length).toBe(3);
    expect(chunks[0].content.length).toBe(1000);
    expect(chunks[1].content.length).toBe(1000);
    expect(chunks[2].content.length).toBe(600);
    expect(chunks.every((c) => c.heading === null)).toBe(true);
  });

  it("chunks by bullets if present", () => {
    const text = "- Bullet one\n- Bullet two\n- Bullet three";
    const chunks = semanticChunkDocument(text, 1000);
    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toContain("Bullet one");
    expect(chunks[0].content).toContain("Bullet two");
    expect(chunks[0].content).toContain("Bullet three");
  });

  it("chunks by sentences if present", () => {
    const text = "Sentence one. Sentence two! Sentence three? Yes.";
    const chunks = semanticChunkDocument(text, 1000);
    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toContain("Sentence one");
    expect(chunks[0].content).toContain("Sentence two");
    expect(chunks[0].content).toContain("Sentence three");
  });

  it("handles overlap logic for sentences and bullets", () => {
    const text = "Sentence one. " + "Sentence two. ".repeat(60);
    const chunks = semanticChunkDocument(text, 100);
    expect(chunks.length).toBeGreaterThan(1);
    const bulletText = "-" + "x".repeat(950) + "\n-" + "y".repeat(2000);
    const bulletChunks = semanticChunkDocument(bulletText, 1000);
    expect(bulletChunks.length).toBeGreaterThan(1);
    expect(bulletChunks[0].content).toContain("x".repeat(100));
    expect(bulletChunks[bulletChunks.length - 1].content).toContain(
      "y".repeat(100)
    );
  });

  it("handles oversized units after overlap", () => {
    const text = "-" + "x".repeat(1200) + "\n-" + "y".repeat(1200);
    const chunks = semanticChunkDocument(text, 1000);
    expect(chunks.length).toBe(3);
    expect(chunks[0].content.length).toBeGreaterThanOrEqual(1000);
    expect(chunks[2].content.length).toBeGreaterThan(0);
    expect(chunks[0].content).toContain("x".repeat(100));
    expect(chunks[2].content).toContain("y".repeat(100));
  });

  it("handles empty and short units", () => {
    const text = "- \n- \n- Short\n-";
    const chunks = semanticChunkDocument(text, 1000);
    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toContain("Short");
  });

  it("handles mixed bullets and sentences exceeding chunk size", () => {
    const bullet = "- Bullet one " + "x".repeat(900);
    const sentence = "Sentence one. " + "y".repeat(900);
    const text = bullet + "\n" + sentence + "\n" + bullet + "\n" + sentence;
    const chunks = semanticChunkDocument(text, 1000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.some((c) => c.content.includes("Bullet one"))).toBe(true);
    expect(chunks.some((c) => c.content.includes("Sentence one."))).toBe(true);
  });

  it("uses default overlap parameter in semanticChunkDocument", () => {
    const text = "- Bullet one\n- Bullet two\n- Bullet three";
    const chunks = semanticChunkDocument(text, 1000);
    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toContain("Bullet one");
    expect(chunks[0].content).toContain("Bullet two");
    expect(chunks[0].content).toContain("Bullet three");
  });

  it("triggers overlap logic for last chunk with sentences and lines", () => {
    const text1 =
      "- This is a long bullet. This is another sentence. " +
      "x".repeat(950) +
      "\n- Short bullet.";
    const chunks1 = semanticChunkDocument(text1, 1000);
    expect(chunks1.length).toBeGreaterThan(1);
    expect(chunks1[0].content).toContain("This is another sentence.");
    expect(chunks1[1].content).toContain("Short bullet");
    const text2 = "- Line one\n- Line two\n-" + "y".repeat(1200);
    const chunks2 = semanticChunkDocument(text2, 1000);
    expect(chunks2.length).toBeGreaterThan(1);
    expect(chunks2[chunks2.length - 1].content).toContain("y".repeat(100));
    const text3 = "- \n- \n- ";
    const chunks3 = semanticChunkDocument(text3, 1000);
    expect(chunks3.length).toBeLessThanOrEqual(1);
    if (chunks3.length === 1) {
      expect(["", "-"]).toContain(chunks3[0].content.trim());
    }
  });

  it("flushes current chunk and covers whitespace/empty units", () => {
    // First unit fills almost the chunk, second is large enough to force flush
    const text = "-" + "a".repeat(950) + "\n-" + "b".repeat(950);
    const chunks = semanticChunkDocument(text, 1000);
    // Should flush after first, then add second, then final flush
    expect(chunks.length).toBe(3);
    expect(chunks[0].content).toContain("a".repeat(100));
    expect(chunks[1].content).toContain("b".repeat(100));
    expect(chunks[2].content.length).toBeGreaterThan(0);
    expect(chunks.every((c) => c.heading === null)).toBe(true);
  });

  it("comprehensive: covers flush, overlap, whitespace, empty, and final chunk", () => {
    // Mix: just under, just over, empty, whitespace, sentences, bullets
    const text = [
      "-" + "a".repeat(950), // just under
      "-" + "b".repeat(1050), // just over, triggers flush
      "-   ", // whitespace
      "-", // empty
      "Sentence one. " + "Sentence two. ".repeat(20), // sentences, triggers overlap
      "-" + "c".repeat(1200), // oversized, triggers flush and overlap
      "- Short bullet",
    ].join("\n");
    const chunks = semanticChunkDocument(text, 1000);
    // Should flush after first, then after oversized, handle overlap, ignore whitespace/empty
    expect(chunks.length).toBe(3);
    expect(chunks[0].content).toContain("a".repeat(100));
    expect(chunks.some((c) => c.content.includes("b".repeat(100)))).toBe(true);
    expect(chunks.some((c) => c.content.includes("Sentence one."))).toBe(true);
    expect(chunks.some((c) => c.content.includes("c".repeat(100)))).toBe(true);
    expect(chunks.some((c) => c.content.includes("Short bullet"))).toBe(true);
    expect(chunks.every((c) => c.heading === null)).toBe(true);
  });
});
