import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@utils/supabase/server";
import { Ollama } from "@langchain/ollama";
import { PromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { OpenAIEmbeddings } from "@langchain/openai";

// Type definitions
interface DocumentChunk {
  content: string;
  chunk_index: number;
  documents?:
    | Array<{
        filename: string;
        id: string;
      }>
    | {
        filename: string;
        id: string;
      };
}

// Search for relevant document chunks using semantic similarity
async function searchDocuments(query: string, userId: string) {
  try {
    const supabase = await createClient();

    // Generate embedding for the query
    const openaiApiKey = process.env.OPENAI_API_KEY;
    let queryEmbedding: number[] = [];

    if (openaiApiKey) {
      try {
        const embeddings = new OpenAIEmbeddings({
          apiKey: openaiApiKey,
          model: "text-embedding-3-small",
        });

        const embedding = await embeddings.embedQuery(query);

        // Pad or truncate to 384 dimensions to match DB schema
        if (embedding.length > 384) {
          queryEmbedding = embedding.slice(0, 384);
        } else if (embedding.length < 384) {
          const padded = [...embedding];
          while (padded.length < 384) {
            padded.push(0);
          }
          queryEmbedding = padded;
        } else {
          queryEmbedding = embedding;
        }
      } catch (error) {
        console.error("Failed to generate query embedding:", error);
        // Fall back to basic text search if embedding fails
      }
    }

    let chunks;

    // Always prioritize semantic (vector) search first
    if (queryEmbedding.length > 0) {
      const { data, error } = await supabase.rpc("search_documents", {
        query_embedding: `[${queryEmbedding.join(",")}]`,
        user_id: userId,
        match_threshold: 0.3,
        match_count: 50,
      });
      if (error) {
        console.error("Vector search error:", error);
      } else {
        chunks = data;
      }
    }

    // Only fall back to keyword search if semantic search returns nothing
    if (!chunks || chunks.length === 0) {
      const keywords = query
        .toLowerCase()
        .split(/\s+/)
        .filter((word) => word.length > 2);
      console.log("Text search keywords:", keywords);

      if (keywords.length > 0) {
        // Supabase .or() expects comma-separated conditions without parentheses
        const orFilter = keywords
          .map((keyword) => `content.ilike.*${keyword}*`)
          .join(",");
        const { data, error } = await supabase
          .from("document_chunks")
          .select(
            `
            content,
            chunk_index,
            document_id,
            documents (
              filename,
              id
            )
          `
          )
          .eq("user_id", userId)
          .or(orFilter)
          .limit(50);

        if (error) {
          console.error("Text search error:", error);
        } else {
          chunks = data;
        }
      }

      // If keyword search fails or returns nothing, get recent chunks
      if (!chunks || chunks.length === 0) {
        const { data, error } = await supabase
          .from("document_chunks")
          .select(
            `
            content,
            chunk_index,
            documents (
              filename,
              id
            )
          `
          )
          .eq("user_id", userId)
          .order("chunk_index")
          .limit(5);

        if (error) {
          console.error("Document search error:", error);
          return [];
        }
        chunks = data;
      }
    }

    return chunks || [];
  } catch (error) {
    console.error("Search error:", error);
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Check authentication and get user
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Search for relevant documents
    const relevantChunks = await searchDocuments(message, user.id);

    // ...existing code...
    // Limit to top 10 relevant chunks for context
    let documentContext = "";
    if (relevantChunks.length > 0) {
      const limitedChunks = relevantChunks.slice(0, 10);
      documentContext = limitedChunks
        .map((chunk: DocumentChunk) => {
          let filename = "Unknown";
          if (chunk.documents) {
            if (Array.isArray(chunk.documents)) {
              filename = chunk.documents[0]?.filename || "Unknown";
            } else {
              filename = chunk.documents?.filename || "Unknown";
            }
          }
          return `Document: ${filename}\nContent: ${chunk.content}`;
        })
        .join("\n\n");
    }

    // Initialize LangChain components
    const llm = new Ollama({
      model: "llama3.2",
      baseUrl: "http://localhost:11434",
      temperature: 0.7,
    });

    // Create prompt template
    const promptTemplate = PromptTemplate.fromTemplate(`
You are a helpful AI assistant that can answer questions about the user's documents and provide general assistance.

{context}

User's question: {question}

Please provide a helpful response. If the question relates to information in the user's documents, use that information in your response. If you reference document information, mention which document it came from.
`);

    // Create the chain
    const chain = RunnableSequence.from([
      {
        context: () =>
          documentContext
            ? `Relevant information from your documents:\n\n${documentContext}`
            : "No relevant documents found.",
        question: (input: { question: string }) => input.question,
      },
      promptTemplate,
      llm,
    ]);

    // ...existing code...

    // Run the chain
    const response = await chain.invoke({ question: message });

    return NextResponse.json({
      response: response,
      documentsReferenced: relevantChunks
        .map((chunk: DocumentChunk) => {
          return Array.isArray(chunk.documents)
            ? chunk.documents[0]?.filename
            : chunk.documents?.filename;
        })
        .filter(Boolean),
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Failed to get response from LLM" },
      { status: 500 }
    );
  }
}
