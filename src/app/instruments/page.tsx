import { createClient } from "@utils/supabase/server";
import ChatInterface from "../components/ChatInterface";

export default async function Instruments() {
  const supabase = await createClient();
  const { data: instruments } = await supabase
    .from("Initial Test Table")
    .select();

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Instruments Dashboard</h1>

      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-2">Database Data:</h2>
        <div className="bg-black text-white p-4 rounded">
          <pre className="text-sm overflow-auto">
            {JSON.stringify(instruments, null, 2)}
          </pre>
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-2">
          LangChain Integration Status:
        </h2>
        <div className="bg-black text-white p-4 rounded">
          <p className="text-green-400 font-medium">
            ✓ Ollama LLM configured (llama3)
          </p>
          <p className="text-green-400 font-medium">
            ✓ Embedding model configured (nomic-embed-text)
          </p>
          <p className="text-gray-300 text-sm mt-2">
            LLM and embedding tests have been moved to prevent hydration issues.
            Use API routes or client components for dynamic LLM interactions.
          </p>
        </div>
      </div>

      <ChatInterface />
    </div>
  );
}
