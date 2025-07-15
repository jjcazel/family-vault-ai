import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@utils/supabase/server";
import crypto from "crypto";
import { processDocument } from "../../../utils/document-processor";

// Background function to process document for RAG
async function processDocumentForRAG(documentId: string, userId: string) {
  try {
    const result = await processDocument(documentId, userId);
    return result;
  } catch (error) {
    console.error(`Failed to process document ${documentId}:`, error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const userId = formData.get("userId") as string;
    const fileId = formData.get("fileId") as string;

    if (!file || !userId || !fileId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Verify user matches authenticated user
    if (userId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Read file content
    const fileBuffer = await file.arrayBuffer();
    const fileContent = Buffer.from(fileBuffer);

    // Generate encryption key and IV
    const encryptionKey = crypto.randomBytes(32); // 256-bit key
    const iv = crypto.randomBytes(16); // 128-bit IV

    // Encrypt file content
    const cipher = crypto.createCipheriv("aes-256-cbc", encryptionKey, iv);
    const encryptedContent = Buffer.concat([
      cipher.update(fileContent),
      cipher.final(),
    ]);

    // Store encrypted key (in production, you'd want to use a key management service)
    const keyHash = crypto
      .createHash("sha256")
      .update(user.id + fileId)
      .digest("hex");

    try {
      // Store file metadata and encrypted content in Supabase
      const { error: insertError } = await supabase.from("documents").insert({
        id: fileId,
        user_id: userId,
        filename: file.name,
        file_size: file.size,
        content_type: file.type,
        encrypted_content: encryptedContent.toString("base64"),
        encryption_key_hash: keyHash,
        iv: iv.toString("base64"),
        encryption_key: encryptionKey.toString("base64"), // In production, store this securely!
        uploaded_at: new Date().toISOString(),
        processed: false,
      });

      if (insertError) {
        console.error("Database error:", insertError);
        throw insertError;
      }

      // Auto-process the document for RAG with improved LangChain pipeline
      processDocumentForRAG(fileId, userId).catch(async (processError) => {
        console.error(
          "Background processing failed for document:",
          fileId,
          processError
        );
        console.error("Error details:", {
          message:
            processError instanceof Error
              ? processError.message
              : "Unknown error",
          stack: processError instanceof Error ? processError.stack : undefined,
          cause: processError instanceof Error ? processError.cause : undefined,
        });

        // Update document with error but don't fail the upload
        const { error } = await supabase
          .from("documents")
          .update({
            processing_error:
              processError instanceof Error
                ? processError.message
                : "Processing failed",
          })
          .eq("id", fileId);

        if (error) {
          console.error(
            "Failed to update document with processing error:",
            error
          );
        }
      });

      return NextResponse.json({
        success: true,
        fileId,
        message: "File uploaded successfully",
      });
    } catch (dbError) {
      console.error("Database operation failed:", dbError);
      return NextResponse.json(
        { error: "Failed to store file in database" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
