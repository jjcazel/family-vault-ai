import { semanticChunkDocument } from "./chunking";

describe("semanticChunkDocument", () => {
  it("returns empty array for empty input", () => {
    expect(semanticChunkDocument("")).toEqual([]);
  });

  it("returns empty array for whitespace-only input", () => {
    expect(semanticChunkDocument("   ")).toEqual([]);
  });

  it("chunks with whitespace at chunk boundaries", () => {
    // This input will chunk as:
    // 1. 1000 'a'
    // 2. 3 spaces + 997 'b' (but .trim() removes spaces, so 1000 'b')
    // 3. 3 'b'
    const text = "a".repeat(1000) + "   " + "b".repeat(1000);
    const chunks = semanticChunkDocument(text, 1000);
    expect(chunks.length).toBe(3);
    expect(chunks[0].content).toBe("a".repeat(1000));
    expect(chunks[1].content).toBe("b".repeat(997));
    expect(chunks[2].content).toBe("b".repeat(3));
    expect(chunks.every((c) => c.heading === null)).toBe(true);
  });

  it("chunks plain text with no headings", () => {
    const text = "a".repeat(2500);
    const chunks = semanticChunkDocument(text, 1000);
    expect(chunks.length).toBe(3);
    expect(chunks[0].content.length).toBe(1000);
    expect(chunks[1].content.length).toBe(1000);
    expect(chunks[2].content.length).toBe(500);
    expect(chunks.every((c) => c.heading === null)).toBe(true);
  });

  it("detects headings and splits sections", () => {
    const text = `Intro:\nThis is intro.\nSection 1:\nFirst section.\nSection 2:\nSecond section.`;
    const chunks = semanticChunkDocument(text, 1000);
    expect(chunks.length).toBe(3);
    expect(chunks[0].heading).toBe("Intro:");
    expect(chunks[1].heading).toBe("Section 1:");
    expect(chunks[2].heading).toBe("Section 2:");
  });

  it("splits large sections into multiple chunks", () => {
    const text = `Header:\n${"x".repeat(2500)}`;
    const chunks = semanticChunkDocument(text, 1000);
    expect(chunks.length).toBe(3);
    expect(chunks[0].heading).toBe("Header:");
    expect(chunks[1].heading).toBe("Header:");
    expect(chunks[2].heading).toBe("Header:");
    expect(chunks[0].content.length).toBe(1000);
    expect(chunks[1].content.length).toBe(1000);
    expect(chunks[2].content.length).toBe(500);
  });

  it("handles empty sections after headings", () => {
    const text = `A:\nB:\nC:\nSome content.`;
    const chunks = semanticChunkDocument(text, 1000);
    expect(chunks.length).toBe(3);
    expect(chunks[0].heading).toBe("A:");
    expect(chunks[0].content).toBe("");
    expect(chunks[1].heading).toBe("B:");
    expect(chunks[1].content).toBe("");
    expect(chunks[2].heading).toBe("C:");
    expect(chunks[2].content).toBe("Some content.");
  });
});
