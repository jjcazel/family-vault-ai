import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center">
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-6">
            Family Vault AI
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-2xl mx-auto">
            Securely store your family&apos;s important documents and chat with
            them using AI. Upload PDFs, analyze content, and get intelligent
            insights about your documents.
          </p>

          <div className="flex gap-4 justify-center">
            <Link
              href="/login"
              className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Get Started
            </Link>
            <Link
              href="/documents"
              className="inline-flex items-center px-6 py-3 bg-gray-200 text-gray-800 font-medium rounded-lg hover:bg-gray-300 transition-colors dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            >
              View Documents
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
              <div className="text-3xl mb-4">🤖</div>
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
