import { redirect } from "next/navigation";

import { createClient } from "@utils/supabase/server";

export default async function PrivatePage() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    redirect("/login");
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Private Page</h1>
      <p className="mb-4">Hello {data.user.email}</p>
      <div className="bg-black text-white p-4 rounded">
        <h2 className="text-lg font-semibold mb-2">User Data:</h2>
        <pre className="text-sm overflow-auto">
          {JSON.stringify(data.user, null, 2)}
        </pre>
      </div>
    </div>
  );
}
