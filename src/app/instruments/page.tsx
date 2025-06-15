import { createClient } from "@utils/supabase/server";
import ChatInterface from "../components/ChatInterface";

export default async function Instruments() {
  const supabase = await createClient();
  const { data: instruments } = await supabase
    .from("Initial Test Table")
    .select();

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Instruments Dashboard</h1>

      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-2">Database Data:</h2>
        <div className="bg-black text-white p-4 rounded">
          <pre className="text-sm overflow-auto">
            {JSON.stringify(instruments, null, 2)}
          </pre>
        </div>
      </div>

      <div className="mb-6"></div>

      <ChatInterface />
    </div>
  );
}
