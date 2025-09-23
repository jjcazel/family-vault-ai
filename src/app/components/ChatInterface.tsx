"use client";

import { useState, useEffect } from "react";

export default function ChatInterface() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversation, setConversation] = useState<
    { human: string; assistant: string }[]
  >([]);

  // Load conversation history from localStorage on component mount
  useEffect(() => {
    // Ensure we're on the client side
    if (typeof window !== "undefined") {
      const savedConversation = localStorage.getItem("chatHistory");
      if (savedConversation && savedConversation !== "[]") {
        try {
          const parsed = JSON.parse(savedConversation);
          console.log("Loading chat history:", parsed); // Debug log
          setConversation(parsed);
        } catch (error) {
          console.error("Error loading chat history:", error);
        }
      }
    }
  }, []);

  // Save conversation history to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== "undefined" && conversation.length > 0) {
      console.log("Saving chat history:", conversation); // Debug log
      localStorage.setItem("chatHistory", JSON.stringify(conversation));
    }
  }, [conversation]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;

    setLoading(true);
    const currentMessage = message;
    // Keep message in input until response arrives

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
        // Clear input after successful response
        setMessage("");
      } else {
        // Add error to conversation
        setConversation((prev) => [
          ...prev,
          {
            human: currentMessage,
            assistant: `Error: ${data.error}`,
          },
        ]);
        // Clear input after error response
        setMessage("");
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
      // Clear input after error
      setMessage("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-6">
      {/* <h2 className="text-lg font-semibold mb-2">Chat with LLM:</h2> */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <div className="gradient-border">
            <div className="gradient-inner">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ask about your uploaded documents..."
                className="w-full p-3 bg-black text-white placeholder-gray-400 rounded-lg resize-none focus:outline-none focus-visible:ring-0 focus-inner"
                rows={3}
              />
            </div>
          </div>
        </div>
        <button
          type="submit"
          disabled={loading || !message.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center min-w-[80px]"
        >
          {loading ? (
            <span className="flex items-center" aria-live="polite">
              <span className="sr-only">Thinking</span>
              <span className="text-sm mr-2 text-pink-400">Thinking</span>
              <span className="flex items-end">
                <span className="dot dot-1" />
                <span className="dot dot-2" />
                <span className="dot dot-3" />
              </span>
            </span>
          ) : (
            "Ask"
          )}
        </button>
      </form>

      {/* Display conversation history */}
      {conversation.length > 0 && (
        <div className="mt-4 space-y-4">
          {/* <h3 className="font-semibold mb-2">Conversation:</h3> */}
          {conversation
            .slice()
            .reverse()
            .map((exchange, index) => (
              <div
                key={conversation.length - 1 - index}
                className="bg-black text-white p-4 rounded-lg border border-gray-700 space-y-3"
              >
                <div className="bg-gradient-to-r from-gray-800 to-gray-700 p-3 rounded-lg border border-gray-600">
                  <span className="font-semibold text-blue-400">You:</span>{" "}
                  <span className="text-gray-100">{exchange.human}</span>
                </div>
                <div className="pl-2">
                  <pre className="text-sm whitespace-pre-wrap text-gray-200">
                    {exchange.assistant}
                  </pre>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Clear chat history button */}
      {conversation.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => {
              setConversation([]);
              localStorage.removeItem("chatHistory");
            }}
            className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
          >
            Clear Chat History
          </button>
        </div>
      )}
    </div>
  );
}
