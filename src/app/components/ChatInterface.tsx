"use client";

import { useState } from "react";

export default function ChatInterface() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversation, setConversation] = useState<
    { human: string; assistant: string }[]
  >([]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;

    setLoading(true);
    const currentMessage = message;
    setMessage(""); // Clear input immediately

    try {
      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          message: currentMessage,
          conversationHistory: conversation,
        }),
      });

      clearTimeout(timeoutId);

      const data = await res.json();

      if (res.ok) {
        // Add to conversation history
        setConversation((prev) => [
          ...prev,
          {
            human: currentMessage,
            assistant: data.response,
          },
        ]);
      } else {
        // Add error to conversation
        setConversation((prev) => [
          ...prev,
          {
            human: currentMessage,
            assistant: `Error: ${data.error}`,
          },
        ]);
      }
    } catch (error) {
      let errorMessage = "Unknown error";
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          errorMessage = "Request timed out after 30 seconds";
        } else {
          errorMessage = error.message;
        }
      }
      // Add error to conversation
      setConversation((prev) => [
        ...prev,
        {
          human: currentMessage,
          assistant: `Error: ${errorMessage}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold mb-2">Chat with LLM:</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ask a question..."
            className="w-full p-3 border rounded-lg resize-none"
            rows={3}
          />
        </div>
        <button
          type="submit"
          disabled={loading || !message.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          {loading ? "Thinking..." : "Ask"}
        </button>
      </form>

      {/* Display conversation history */}
      {conversation.length > 0 && (
        <div className="mt-4 space-y-4">
          <h3 className="font-semibold mb-2">Conversation:</h3>
          {conversation.map((exchange, index) => (
            <div key={index} className="space-y-2">
              <div className="bg-blue-100 p-3 rounded">
                <strong>You:</strong> {exchange.human}
              </div>
              <div className="bg-black text-white p-4 rounded">
                <strong>Assistant:</strong>
                <pre className="text-sm whitespace-pre-wrap mt-1">
                  {exchange.assistant}
                </pre>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Show loading indicator */}
      {loading && (
        <div className="mt-4 bg-gray-100 p-4 rounded">
          <p className="text-center">🤔 Thinking...</p>
        </div>
      )}
    </div>
  );
}
