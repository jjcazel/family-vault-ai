import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const requestStartTime = Date.now();

    const { message } = await request.json();
    const parseTime = Date.now();
    console.log(`JSON parsing took: ${parseTime - requestStartTime}ms`);

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    console.log("Starting direct Ollama request...");
    const ollamaStartTime = Date.now();

    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    // Direct fetch to Ollama API (bypassing LangChain)
    const ollamaResponse = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "llama3.2",
        prompt: message,
        stream: false,
        options: {
          num_predict: 250,
          temperature: 0.7,
          top_k: 40,
          top_p: 0.9,
          // stop: ["\n\n", "Human:", "User:"], // Stop at natural breakpoints
        },
      }),
    });

    clearTimeout(timeoutId);

    const fetchTime = Date.now();
    console.log(`Fetch request took: ${fetchTime - ollamaStartTime}ms`);

    if (!ollamaResponse.ok) {
      throw new Error(`Ollama API error: ${ollamaResponse.status}`);
    }

    const data = await ollamaResponse.json();
    const jsonTime = Date.now();
    console.log(`Response JSON parsing took: ${jsonTime - fetchTime}ms`);

    const totalTime = Date.now();
    console.log(`Total API route time: ${totalTime - requestStartTime}ms`);

    return NextResponse.json({ response: data.response });
  } catch (error) {
    console.error("LLM Error:", error);
    return NextResponse.json(
      { error: "Failed to get response from LLM" },
      { status: 500 }
    );
  }
}
