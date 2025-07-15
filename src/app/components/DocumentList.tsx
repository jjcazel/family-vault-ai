"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@utils/supabase/client";

interface Document {
  id: string;
  filename: string;
  file_size: number;
  content_type: string;
  uploaded_at: string;
  processed: boolean;
  created_at: string;
  processing_error?: string;
  extracted_text?: string;
}

interface DocumentListProps {
  userId: string;
}

export default function DocumentList({ userId }: DocumentListProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const supabase = createClient();

      const { data, error } = await supabase
        .from("documents")
        .select(
          "id, filename, file_size, content_type, uploaded_at, processed, created_at, processing_error"
        )
        .eq("user_id", userId)
        .order("uploaded_at", { ascending: false });

      if (error) {
        throw error;
      }

      setDocuments(data || []);
      return data || [];
    } catch (err) {
      console.error("Error fetching documents:", err);
      setError("Failed to load documents");
      return [];
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Auto-refresh for processing status updates
  useEffect(() => {
    const checkForProcessingDocuments = () => {
      return documents.some((doc) => !doc.processed && !doc.processing_error);
    };

    if (checkForProcessingDocuments()) {
      const interval = setInterval(() => {
        fetchDocuments().then((updatedDocs) => {
          // Stop polling if no documents are processing
          const stillProcessing = updatedDocs.some(
            (doc) => !doc.processed && !doc.processing_error
          );
          if (!stillProcessing) {
            clearInterval(interval);
          }
        });
      }, 2000); // Check every 2 seconds

      return () => clearInterval(interval);
    }
  }, [documents, fetchDocuments]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getFileIcon = (contentType: string) => {
    if (contentType.includes("pdf")) return "📄";
    if (contentType.includes("word") || contentType.includes("document"))
      return "📝";
    if (contentType.includes("text")) return "📋";
    if (contentType.includes("image")) return "🖼️";
    return "📎";
  };

  const handleDelete = async (documentId: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this document? This action cannot be undone."
      )
    ) {
      return;
    }

    try {
      const supabase = createClient();

      const { error } = await supabase
        .from("documents")
        .delete()
        .eq("id", documentId)
        .eq("user_id", userId);

      if (error) {
        throw error;
      }

      // Remove from local state
      setDocuments((prev) => prev.filter((doc) => doc.id !== documentId));
    } catch (err) {
      console.error("Error deleting document:", err);
      alert("Failed to delete document");
    }
  };

  const handleReprocess = async (documentId: string) => {
    if (
      !confirm(
        "Are you sure you want to reprocess this document? This will replace the existing processed content."
      )
    ) {
      return;
    }

    try {
      const supabase = createClient();

      // First reset the document to unprocessed state and clear existing chunks
      const { error: resetError } = await supabase
        .from("documents")
        .update({
          processed: false,
          processing_error: null,
          extracted_text: null,
        })
        .eq("id", documentId)
        .eq("user_id", userId);

      if (resetError) {
        throw new Error(resetError.message || "Failed to reset document");
      }

      // Delete existing chunks for this document
      const { error: deleteError } = await supabase
        .from("document_chunks")
        .delete()
        .eq("document_id", documentId)
        .eq("user_id", userId);

      if (deleteError) {
        console.warn("Warning: Failed to delete existing chunks:", deleteError);
        // Continue anyway as this is not critical
      }

      // Then process it again with the new LangChain improvements
      const processResponse = await fetch("/api/process-document", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentId }),
      });

      const processData = await processResponse.json();

      if (processResponse.ok) {
        alert(
          `Document reprocessed successfully! Created ${processData.chunks} text chunks with improved LangChain processing.`
        );
        // Refresh the document list
        window.location.reload();
      } else {
        throw new Error(processData.error || "Reprocessing failed");
      }
    } catch (err) {
      console.error("Error reprocessing document:", err);
      alert(
        `Failed to reprocess document: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    }
  };

  const handleProcess = async (documentId: string) => {
    try {
      const response = await fetch("/api/process-document", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentId }),
      });

      const data = await response.json();

      if (response.ok) {
        alert(
          `Document processed successfully! Created ${data.chunks} text chunks.`
        );
        // Refresh the document list
        window.location.reload();
      } else {
        throw new Error(data.error || "Processing failed");
      }
    } catch (err) {
      console.error("Error processing document:", err);
      alert(
        `Failed to process document: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Your Documents</h3>
        <div className="flex items-center justify-center py-8">
          <div className="text-gray-500">Loading documents...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Your Documents</h3>
        <div className="text-red-600 text-center py-8">{error}</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">
        Your Documents ({documents.length})
      </h3>

      {documents.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <div className="text-4xl mb-2">📁</div>
          <p>No documents uploaded yet</p>
          <p className="text-sm">
            Upload your first document above to get started
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <span className="text-2xl">
                  {getFileIcon(doc.content_type)}
                </span>

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {doc.filename}
                  </p>
                  <div className="flex items-center space-x-4 text-sm text-gray-500">
                    <span>{formatFileSize(doc.file_size)}</span>
                    <span>•</span>
                    <span>{formatDate(doc.uploaded_at)}</span>
                    <span>•</span>
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${
                        doc.processed
                          ? "bg-green-100 text-green-800"
                          : doc.processing_error
                          ? "bg-red-100 text-red-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                      title={doc.processing_error || undefined}
                    >
                      {doc.processed
                        ? "✅ Ready for RAG"
                        : doc.processing_error
                        ? "❌ Processing Failed"
                        : "⏳ Processing..."}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 ml-4">
                {!doc.processed && !doc.processing_error && (
                  <button
                    onClick={() => handleProcess(doc.id)}
                    className="text-blue-600 hover:text-blue-800 p-2 rounded hover:bg-blue-50"
                    title="Process document for RAG"
                  >
                    ⚙️
                  </button>
                )}
                {doc.processed && (
                  <button
                    onClick={() => handleReprocess(doc.id)}
                    className="text-orange-600 hover:text-orange-800 p-2 rounded hover:bg-orange-50"
                    title="Reprocess document (will replace existing content)"
                  >
                    🔄
                  </button>
                )}
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="text-red-600 hover:text-red-800 p-2 rounded hover:bg-red-50"
                  title="Delete document"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
