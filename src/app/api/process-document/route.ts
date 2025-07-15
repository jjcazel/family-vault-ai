import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@utils/supabase/server";
import { processDocument } from "../../../utils/document-processor";

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

    const body = await request.json();
    const documentId = body.documentId;

    if (!documentId) {
      return NextResponse.json(
        { error: "Document ID is required" },
        { status: 400 }
      );
    }

    try {
      const result = await processDocument(documentId, user.id);
      return NextResponse.json(result);
    } catch (processingError) {
      return NextResponse.json(
        {
          error:
            processingError instanceof Error
              ? processingError.message
              : "Processing failed",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Processing failed" },
      { status: 500 }
    );
  }
}
