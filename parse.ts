import { LlamaParseReader } from "llamaindex";
import "dotenv/config";

async function main() {
  // Change this path to your PDF file
  const path = "./canada.pdf";

  // Set up the LlamaParse reader
  const reader = new LlamaParseReader({ resultType: "markdown" });

  // Parse the document
  const documents = await reader.loadData(path);

  // Print the parsed document
  console.log(documents);
}

main().catch(console.error);
