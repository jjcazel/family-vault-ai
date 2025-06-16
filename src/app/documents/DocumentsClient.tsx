"use client";

import { useState, useCallback } from "react";
import FileUpload from "../components/FileUpload";
import DocumentList from "../components/DocumentList";

interface DocumentsClientProps {
  userId: string;
}

export default function DocumentsClient({ userId }: DocumentsClientProps) {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUploadComplete = useCallback(() => {
    // Trigger a refresh of the document list
    setRefreshKey((prev) => prev + 1);
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Document Vault</h1>

      <div className="mb-6">
        <p className="text-gray-600 mb-4">
          Upload your sensitive documents securely. Files are encrypted before
          storage and will be used to train your personal AI assistant.
        </p>
      </div>

      <FileUpload userId={userId} onUploadComplete={handleUploadComplete} />

      <div className="mt-8">
        <DocumentList userId={userId} key={refreshKey} />
      </div>
    </div>
  );
}
