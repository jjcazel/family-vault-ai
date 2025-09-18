# Family Vault AI — Architecture & How it Works

This project securely uploads, stores, indexes, and answers questions about family documents using Retrieval-Augmented Generation (RAG). The README explains the end-to-end flow, where embeddings/vectors live, what an RPC is, how LangChain is used in this repo, and what `ivfflat` means.

## Quick overview (one-paragraph)

Users upload documents. The server stores the uploaded file (encrypted) in Postgres (via Supabase). A background job extracts text from the file, breaks it into semantic chunks, generates numeric embeddings for each chunk, and stores those chunks and embeddings in a `document_chunks` table (the embedding is stored in a Postgres `VECTOR` column). When a user asks a question, the app turns the question into an embedding, asks the database for the most semantically similar chunks (vector search), and passes those chunks to the LLM (Ollama) as context. The LLM returns an answer that is grounded in the retrieved document content (this is RAG).

## End-to-end flow (step-by-step)

1. Upload

   - Client uploads a file to `POST /api/upload`.
   - Server authenticates, encrypts the file, and inserts a row into the `documents` table with the encrypted content and metadata.
   - The server triggers background processing (non-blocking) to extract text and create embeddings.

2. Processing (background)

   - Fetch document by ID and decrypt its content.
   - Extract text: try `LlamaParseReader` for PDFs; fallback to `pdf2json`, `mammoth` for Word, or plain text parsing.
   - Chunk the extracted text semantically (split by bullets/sentences; fall back to a character-based chunker).
   - For each chunk, generate an embedding (prefer OpenAI embeddings when configured; otherwise a deterministic hash fallback).
   - Insert chunk rows into `document_chunks` table. Each chunk stores: document_id, user_id, chunk_index, content, token_count, and an `embedding` stored as a Postgres VECTOR.
   - Mark the `documents.processed = true` and optionally save a short preview of the extracted text.

3. Retrieval and chat (inference)
   - User sends a chat message to `POST /api/chat`.
   - The server generates an embedding for the message (query embedding).
   - The server calls a database RPC `search_documents` (or uses a vector operator) to find the nearest document chunks to that query embedding.
   - If vector search yields no results, the code falls back to Postgres full-text search on the chunk content.
   - The top-N chunks are combined into the prompt context and passed to the LLM (Ollama) to generate the final answer.

## Where vectors live

- Vectors (embeddings) are stored in the Supabase Postgres DB in a `VECTOR(384)` column on `document_chunks.embedding`.
- The DB uses an `ivfflat` index to make nearest-neighbor searches fast. So the vector store _is_ the Postgres DB, not a separate vector DB service.

## What is an RPC and where does it fit?

- RPC stands for "Remote Procedure Call". In the Postgres/Supabase context it means a function stored in the database that you can call with parameters.
- This repo calls `supabase.rpc('search_documents', { query_embedding: '...', user_id, ... })` to run a pre-built function inside the DB that performs the vector search and returns matching rows.
- RPCs can be created in three ways: (1) run SQL in the Supabase dashboard, (2) include SQL migration files in the repo and apply them, or (3) create the functions from your CI/deploy pipeline. In this project the `search_documents` function is expected to exist in the DB; add its SQL to `database/` for reproducibility.

## LangChain — what it is and how we use it here

- LangChain is a utility library that helps you wire together components used in LLM applications: prompt templates, LLM clients, embedding clients, chains of transformations, and more.
- In this repo LangChain is used for:
  - Wrapping the OpenAI embeddings client (`OpenAIEmbeddings`) — making embedding calls easy and consistent.
  - Building prompt templates (via `PromptTemplate`) and composing a small runnable chain (`RunnableSequence`). That helps keep prompt creation and the LLM invocation tidy and reusable.

### Why LangChain matters (simple example)

- Without LangChain, you'd assemble a prompt string manually and call the LLM client directly. With LangChain you can separate concerns: prepare context, plug context into a template, then run the LLM. This makes it easier to test, swap LLMs, or add steps (e.g., a filter or scoring step) between retrieval and final generation.

### Simple conceptual example

```ts
// Build a simple prompt template
const prompt = PromptTemplate.fromTemplate(`
Context: {context}
Question: {question}
Answer:
`);

// Compose a small runnable chain: prepare context, plug into template, run LLM
const chain = RunnableSequence.from([
  { context: () => retrievedText, question: (input) => input.question },
  prompt,
  llmClient,
]);

// Run:
const result = await chain.invoke({ question: "What is X?" });
```

## What is `ivfflat`? (plain and simple)

- `ivfflat` is a type of index used for approximate nearest neighbor (ANN) searches on vectors.
- The full name: IVF (Inverted File) + FLAT. IVF groups vectors into a number of clusters (the index's `nlist`) and only searches the most promising clusters instead of scanning everything.
- This makes queries much faster at the cost of being approximate (might miss a few best matches sometimes).
- Two important knobs:
  - `nlist` (number of clusters): more clusters usually means faster search and potentially higher recall, but uses more memory and longer index build time.
  - `nprobe` (or probes): how many clusters to search at query time; more probes means more accurate results (slower) but fewer missed neighbors.
- Postgres (via the `pgvector` extension) supports ivfflat and vector operators; the SQL file in `database/create_document_chunks_table.pgsql` creates an ivfflat index for `document_chunks.embedding`.

## Security notes & production tips

- Do not store raw encryption keys in the database for production. Use a KMS (AWS KMS, GCP KMS, or Vault) and store only encrypted key references in the DB.
- Add transactions around chunk inserts and document status updates to avoid partial states.
- Version-control your DB schema and RPCs (add the `search_documents` function SQL to `database/`), so you can recreate your DB schema anywhere.

## Example `search_documents` function (recommended to add to the repo)

Below is a simple example SQL function concept (adapt to your SQL dialect and security model). Add a migration that creates a `search_documents` function if you want reproducible deploys.

```sql
-- Conceptual example (simplified):
CREATE FUNCTION search_documents(
	query_embedding vector, -- or text that you cast to vector
	user_id uuid,
	match_threshold float DEFAULT 0.0,
	match_count int DEFAULT 10
) RETURNS TABLE (
	id uuid,
	document_id text,
	content text,
	chunk_index int,
	similarity float
) AS $$
BEGIN
	RETURN QUERY
	SELECT id, document_id, content, chunk_index,
		1 - (embedding <=> query_embedding) as similarity -- or use cosine_distance
	FROM document_chunks
	WHERE user_id = user_id
	ORDER BY embedding <-> query_embedding
	LIMIT match_count;
END;
$$ LANGUAGE plpgsql;
```

> Note: This is a conceptual sketch. The actual implementation depends on your Postgres version, `pgvector` API in your DB, and how your app passes the vector (string vs native vector). If your Supabase project already has a `search_documents` rpc, copy its SQL to `database/` for version control.
