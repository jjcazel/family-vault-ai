import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@utils/supabase/server";
import crypto from "crypto";

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

      return NextResponse.json({
        success: true,
        fileId,
        message: "File encrypted and uploaded successfully",
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
