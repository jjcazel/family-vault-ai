import { redirect } from "next/navigation";
import { createClient } from "@utils/supabase/server";
import FileUpload from "../components/FileUpload";

export default async function Documents() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    redirect("/auth/signin");
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Document Vault</h1>

      <div className="mb-6">
        <p className="text-gray-600 mb-4">
          Upload your sensitive documents securely. Files are encrypted before
          storage and will be used to train your personal AI assistant.
        </p>
      </div>

      <FileUpload userId={data.user.id} />
    </div>
  );
}
