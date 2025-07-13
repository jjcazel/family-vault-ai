import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@utils/supabase/server";

// Search for relevant document chunks
async function searchDocuments(query: string, userId: string) {
  try {
    const supabase = await createClient();

    // Get all chunks for the user with document info
    const { data: chunks, error } = await supabase
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
      .limit(10); // Increase limit to get more chunks

    if (error) {
      console.error("Document search error:", error);
      return [];
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

    // Build context from retrieved documents
    let documentContext = "";
    if (relevantChunks.length > 0) {
      documentContext = "\n\nRelevant information from your documents:\n\n";
      relevantChunks.forEach((chunk) => {
        documentContext += `Document: ${
          chunk.documents?.[0]?.filename || "Unknown"
        }\n`;
        documentContext += `Content: ${chunk.content}\n\n`;
      });
    }

    // Enhanced prompt with document context
    const enhancedPrompt = `You are a helpful AI assistant that can answer questions about the user's documents and provide general assistance. 

User's question: ${message}
${documentContext}

Please provide a helpful response. If the question relates to information in the user's documents, use that information in your response. If you reference document information, mention which document it came from.`;

    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    // Direct fetch to Ollama API with document context
    const ollamaResponse = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "llama3.2",
        prompt: enhancedPrompt, // Use enhanced prompt with document context
        stream: false,
        options: {
          num_predict: 250,
          temperature: 0.7,
          top_k: 40,
          top_p: 0.9,
        },
      }),
    });

    clearTimeout(timeoutId);

    if (!ollamaResponse.ok) {
      throw new Error(`Ollama API error: ${ollamaResponse.status}`);
    }

    const data = await ollamaResponse.json();

    return NextResponse.json({
      response: data.response,
      documentsReferenced: relevantChunks
        .map((chunk) => chunk.documents?.[0]?.filename)
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
