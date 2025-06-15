"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";

interface FileUploadProps {
  userId: string;
}

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  uploadedAt: string;
  status: "uploading" | "completed" | "error";
}

export default function FileUpload({ userId }: FileUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setUploading(true);

      for (const file of acceptedFiles) {
        const fileId = Date.now().toString() + Math.random().toString(36);

        // Add file to state with uploading status
        const newFile: UploadedFile = {
          id: fileId,
          name: file.name,
          size: file.size,
          uploadedAt: new Date().toISOString(),
          status: "uploading",
        };

        setFiles((prev) => [...prev, newFile]);

        try {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("userId", userId);
          formData.append("fileId", fileId);

          const response = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          });

          if (response.ok) {
            // Update file status to completed
            setFiles((prev) =>
              prev.map((f) =>
                f.id === fileId ? { ...f, status: "completed" as const } : f
              )
            );
          } else {
            throw new Error("Upload failed");
          }
        } catch (error) {
          console.error("Upload error:", error);
          // Update file status to error
          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileId ? { ...f, status: "error" as const } : f
            )
          );
        }
      }

      setUploading(false);
    },
    [userId]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/plain": [".txt"],
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        [".docx"],
      "application/msword": [".doc"],
      "text/markdown": [".md"],
    },
    maxSize: 10 * 1024 * 1024, // 10MB limit
  });

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getStatusIcon = (status: UploadedFile["status"]) => {
    switch (status) {
      case "uploading":
        return "⏳";
      case "completed":
        return "✅";
      case "error":
        return "❌";
    }
  };

  return (
    <div className="space-y-6">
      {/* Drag and Drop Area */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${
            isDragActive
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 hover:border-gray-400"
          }
          ${uploading ? "opacity-50 cursor-not-allowed" : ""}
        `}
      >
        <input {...getInputProps()} />

        <div className="space-y-4">
          <div className="text-4xl">📄</div>

          {isDragActive ? (
            <p className="text-lg text-blue-600">Drop your documents here...</p>
          ) : (
            <div>
              <p className="text-lg font-medium">
                Drop documents here, or click to browse
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Supports: PDF, DOCX, DOC, TXT, MD (Max 10MB each)
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Upload Status */}
      {uploading && (
        <div className="bg-blue-50 p-4 rounded-lg">
          <p className="text-blue-800 font-medium">
            🔐 Encrypting and uploading files...
          </p>
        </div>
      )}

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Uploaded Documents</h3>

          <div className="space-y-2">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-4 bg-white border rounded-lg shadow-sm"
              >
                <div className="flex items-center space-x-3">
                  <span className="text-xl">{getStatusIcon(file.status)}</span>
                  <div>
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-gray-500">
                      {formatFileSize(file.size)} •{" "}
                      {new Date(file.uploadedAt).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="text-sm">
                  {file.status === "uploading" && (
                    <span className="text-blue-600">Uploading...</span>
                  )}
                  {file.status === "completed" && (
                    <span className="text-green-600">Encrypted & Stored</span>
                  )}
                  {file.status === "error" && (
                    <span className="text-red-600">Upload Failed</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
