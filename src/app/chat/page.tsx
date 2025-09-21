import ChatInterface from "../components/ChatInterface";

export default async function Chat() {
  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">
        Chat powered with Ollama Llama3 LLM
      </h1>
      <p className="text-gray-600 mb-6">
        Ask questions about your documents or get general assistance.
      </p>

      <ChatInterface />
    </div>
  );
}
