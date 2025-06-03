import { createClient } from "../../../utils/supabase/server";
import { Ollama } from "@langchain/ollama";
import { OllamaEmbeddings } from "@langchain/ollama";

export default async function Instruments() {
  const supabase = await createClient();
  const { data: instruments } = await supabase
    .from("Initial Test Table")
    .select();

  // Initialize Ollama LLM
  const llm = new Ollama({
    baseUrl: "http://localhost:11434", // Default Ollama API endpoint
    model: "llama3", // Model you pulled
  });

  // Initialize Ollama Embeddings
  const embeddings = new OllamaEmbeddings({
    baseUrl: "http://localhost:11434", // Default Ollama API endpoint
    model: "nomic-embed-text", // Embedding model you pulled
  });

  // Example: Simple LLM call (you'll integrate this with your document logic)
  const stream = await llm.stream("Why is the sky blue?");

  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  const llmResponse = chunks.join("");

  // Example: Creating an embedding (you'll use this for your documents)
  const textEmbedding = await embeddings.embedQuery("This is a test document.");

  return (
    <div>
      <pre>{JSON.stringify(instruments, null, 2)}</pre>
      <h2>LLM Test:</h2>
      <p>{"Why is the sky blue?"}</p>
      <p>{llmResponse}</p>
      <h2>Embedding Test (first 5 values):</h2>
      <pre>{JSON.stringify(textEmbedding?.slice(0, 5), null, 2)}</pre>
    </div>
  );
}
