import { redirect } from "next/navigation";
import { createClient } from "@utils/supabase/server";
import DocumentsClient from "./DocumentsClient";

export default async function Documents() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    redirect("/login");
  }

  return <DocumentsClient userId={data.user.id} />;
}
