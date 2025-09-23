import Link from "next/link";
import { createClient } from "@utils/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div
      className="min-h-screen"
      style={{
        background:
          "linear-gradient(to bottom, #000000 0%, #071233 60%, #0b2a6b 100%)",
      }}
    >
      <div className="container mx-auto px-4 py-16">
        <div className="text-center">
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-6">
            Family Vault AI
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-2xl mx-auto">
            Securely store your family’s important documents and use AI to get
            answers to your toughest questions. Upload PDFs, analyze content,
            and get clear, intelligent insights — all in one private,
            easy-to-use place.
          </p>

          <div className="flex gap-4 justify-center">
            {!user && (
              <Link
                href="/login"
                className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
              >
                Get Started
              </Link>
            )}
            <Link
              href="/documents"
              className="inline-flex items-center px-6 py-3 bg-gray-200 text-gray-800 font-medium rounded-lg hover:bg-gray-300 transition-colors dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 cursor-pointer"
            >
              {user ? "Go to Documents" : "View Documents"}
            </Link>
          </div>

          <div className="mt-16 grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
              <div className="text-3xl mb-4">🔒</div>
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
                Secure Storage
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                End-to-end encryption ensures your documents are safe and
                private
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
              <div className="text-3xl mb-4">✨</div>
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
                AI-Powered
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                Chat with your documents using local LLM for intelligent
                insights
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
              <div className="text-3xl mb-4">📄</div>
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
                Easy Upload
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                Drag and drop PDFs, DOCX, and text files for automatic
                processing
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
