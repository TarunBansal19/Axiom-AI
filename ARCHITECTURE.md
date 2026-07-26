# Architecture — AI Research Assistant

A Gemini-Notebook-style app: multiple notebooks, each with isolated knowledge
sources (PDF, text, URL/web link, YouTube, VTT), queryable with grounded,
cited answers. This document reflects the finalized diagrams (system overview,
query pipeline, UI wireframes) and is the source of truth for implementation —
if a vibe-coding session produces something that contradicts this doc, the doc
wins; update it deliberately if the design changes, don't let it drift.

---

## 1. Tech stack

| Layer             | Tech                                                                                   | Role                                                                                |
| ----------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Frontend          | React + shadcn/ui                                                                      | sidebar, source upload, chat, source viewer split panel                             |
| Backend API       | Node.js + Express                                                                      | REST endpoints, orchestration                                                       |
| Structured DB     | Postgres (Neon) via Prisma                                                             | source of truth for everything except vectors                                       |
| Vector DB         | Qdrant                                                                                 | embeddings + minimal payload for similarity search                                  |
| Queue             | BullMQ + Redis                                                                         | decouples slow ingestion from the request/response cycle                            |
| Worker            | Node.js (separate process)                                                             | consumes ingestion jobs, runs the pipeline                                          |
| File storage      | AWS S3 (dev: local disk)                                                               | raw PDF/VTT bytes and URL text snapshots — Postgres only stores a pointer, see §3.4 |
| RAG orchestration | LangChain (selective use)                                                              | embedding calls, prompt templating, retriever interface                             |
| LLM               | Gemini API / OpenAI API                                                                | grounded answer generation                                                          |
| Embeddings        | OpenAI embeddings API                                                                  | chunk + query vectors                                                               |
| Extraction        | `pdf-parse`, `@mozilla/readability` + `jsdom`, `youtube-transcript`, custom VTT parser | per-source-type text extraction                                                     |

---

## 2. System overview

```
Upload Source              User Query
(PDF, text, vtt, url)          │
      │                        ▼
      ▼                 ┌──────────────┐
┌──────────────┐        │ Query Pipeline│
│ Ingestion     │        └──────┬───────┘
│ Pipeline      │           ▲   │  │
└──────┬────────┘           │   │  │
       │                    │   │  └──────────────┐
       ▼                    │   ▼                  ▼
┌──────────────────────────┴───────┐        ┌───────────────┐
│  Qdrant + Postgres (via Neon)     │        │ Cited Answers  │
└───────────────────────────────────┘        └───────────────┘
```

- **Ingestion pipeline** only ever _writes_ to the store. It never talks to
  the query pipeline directly.
- **Query pipeline** _reads_ from the store (retrieval) and _writes back_ a
  `Query` + `Answer` row after generation — hence the bidirectional arrow
  between Query Pipeline and the store.
- **Cited Answers** is the query pipeline's output, consumed by the frontend
  chat + source viewer.
- Ingestion is queued (BullMQ/Redis) because it's slow and multi-stage; query
  is synchronous (single request/response) because it's fast — see §5 vs §6.

---

## 3. Data model

### 3.1 Postgres (Prisma) — source of truth for everything except vectors

```prisma
model Notebook {
  id        String   @id @default(uuid())
  name      String
  ownerId   String
  createdAt DateTime @default(now())
  sources   Source[]
}

model Source {
  id             String       @id @default(uuid())
  notebookId     String
  notebook       Notebook     @relation(fields: [notebookId], references: [id])
  type           SourceType
  originalUri    String        // file path, URL, or video id
  title          String?
  status         SourceStatus  @default(UPLOADING)
  statusDetail   String?       // error message or progress note
  rawContentRef  String?       // stored file / URL snapshot / transcript
  createdAt      DateTime @default(now())
  indexedAt      DateTime?
  chunks         Chunk[]
}

enum SourceType {
  PDF
  TEXT
  URL
  YOUTUBE
  VTT
}

// drives the sidebar status dot: yellow = INDEXING-ish states, green = READY
enum SourceStatus {
  UPLOADING
  EXTRACTING
  CHUNKING
  EMBEDDING
  READY
  FAILED
}

model Chunk {
  id          String   @id @default(uuid())
  sourceId    String
  source      Source   @relation(fields: [sourceId], references: [id])
  notebookId  String   // denormalized — every chunk carries this directly
  text        String
  chunkIndex  Int
  location    Json     // shape depends on Source.type — see §4
  createdAt   DateTime @default(now())

  @@index([notebookId])
  @@index([sourceId])
}

model Query {
  id          String   @id @default(uuid())
  notebookId  String
  question    String
  createdAt   DateTime @default(now())
  answer      Answer?
}

model Answer {
  id         String   @id @default(uuid())
  queryId    String   @unique
  query      Query    @relation(fields: [queryId], references: [id])
  text       String
  citations  Json     // [{ chunkId, sourceId, snippet }] — structured, see §7
  createdAt  DateTime @default(now())
}
```

**No embedding column on `Chunk`.** The vector lives in Qdrant only —
`Chunk.id` is the join key between the two systems.

### 3.2 Qdrant — vectors only, minimal payload

One collection, e.g. `chunks`, corresponds to the "Vector Stores" box in the
diagram. Each point:

```json
{
  "id": "<same value as Chunk.id in Postgres>",
  "vector": [0.023, -0.041, ...],
  "payload": { "notebook_id": "<Chunk.notebookId>" }
}
```

No text, no location, no title in the payload — just enough to filter
(`notebook_id`) and join back (`id`). This is what "Vector Stores — filtered
by notebook_id" means concretely in the diagram: every search call passes
`filter: { must: [{ key: "notebook_id", match: { value: notebookId } }] }`.

Whether this is implemented as one Qdrant collection with a payload filter,
or physically separate collections per notebook ("Store-1, Store-2, Store-3,
Store-4" in the diagram), is an implementation detail behind the **Adaptor**
(§6) — start with one collection + payload filter, it's simpler and scales
fine for this project. The Adaptor is what lets you change that decision
later without touching the retrieval/rerank/generation code above it.

### 3.3 File storage (S3) — where `rawContentRef` actually points

Postgres and Qdrant never hold raw file bytes. A third store handles that:

| Type     | What's stored                                | Where                                                                                 |
| -------- | -------------------------------------------- | ------------------------------------------------------------------------------------- |
| PDF      | the uploaded PDF file                        | S3, key like `sources/<sourceId>.pdf`                                                 |
| VTT      | the uploaded `.vtt` file                     | S3, key like `sources/<sourceId>.vtt`                                                 |
| Web Link | the _extracted_ text snapshot (not raw HTML) | S3, or a Postgres column if you'd rather skip a moving part — small enough either way |
| Text     | the uploaded text                            | S3 or a Postgres column, same tradeoff as above                                       |
| YouTube  | nothing — just `originalUri` (the video id)  | not stored anywhere; the viewer streams from YouTube directly                         |

`Source.rawContentRef` holds the S3 **key** (a string), never the bytes
themselves. The flow:

```
Upload → worker writes bytes to S3 under "sources/<sourceId>.<ext>"
       → Source.rawContentRef = that key
       → extraction step reads the bytes back from S3 to process them

Source viewer → reads Source.rawContentRef from Postgres
              → fetches the bytes from S3 using that key
              → hands them to pdf.js (PDF) or renders as text (Text/URL/VTT)
```

**Dev vs prod**: use local disk while developing (`fs.writeFile`/`fs.readFile`
against an `/uploads` folder — zero setup, but not durable on Render/Vercel),
swap to real S3 for anything deployed. Keep both behind the same `putFile` /
`getFile` / `deleteFile` function signatures so nothing else in the codebase
needs to know which one is active:

```ts
// storage.ts
export async function putFile(key: string, bytes: Buffer) {
  if (process.env.NODE_ENV === "development") {
    return fs.writeFile(`./uploads/${key}`, bytes);
  }
  const s3 = new S3Client({ region: process.env.AWS_REGION });
  return s3.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME!,
      Key: key,
      Body: bytes,
    }),
  );
}
```

**Deleting a source now touches three stores, not two** (§3.3 said "both
stores" — with file storage added, it's Postgres + Qdrant + S3, all in one
delete function):

```
deleteSource(sourceId):
  1. delete Chunk rows from Postgres (by sourceId)
  2. delete matching vector points from Qdrant (by sourceId in payload)
  3. delete the file from S3 (by rawContentRef), if one exists for this type
  4. delete the Source row itself
```

### 3.4 The three-store contract

- **Create a chunk** = one Postgres insert (`Chunk` row) + one Qdrant upsert
  (vector, same id, `notebook_id` payload). Always both, in one function.
- **Create a source with a file** (PDF/VTT) = write the file to S3 **first**,
  get back a key, save that key as `Source.rawContentRef`, then proceed with
  ingestion. If the S3 write fails, don't create chunks at all.
- **Delete a chunk / re-index a source** = delete Postgres rows for that
  `sourceId` **and** delete Qdrant points with matching ids. Never one without
  the other. If it's a full source deletion (not just re-index), also delete
  the S3 object — see §3.3.
- **Retrieval** = search Qdrant (filtered by `notebook_id`) → `[{id, score}]`
  → fetch those `Chunk` rows from Postgres by id → real text to work with.
- **Isolation lives in the Qdrant filter for retrieval, and in Postgres
  `WHERE notebook_id` for everything else.** No exceptions, in either system.

---

## 4. `location` shape per source type

```ts
type Location =
  | { type: "pdf"; page: number; bbox?: [number, number, number, number] }
  | { type: "text"; charStart: number; charEnd: number }
  | { type: "url"; charStart: number; charEnd: number } // offsets into the stored snapshot, not the live page
  | { type: "youtube"; startSeconds: number; endSeconds?: number }
  | { type: "vtt"; cueIndex: number; startTime: string };
```

---

## 5. Ingestion pipeline

```
POST /sources  (multipart for PDF, JSON for text/url/youtube/vtt)
  → write Source row, status = UPLOADING, type ∈ {PDF, TEXT, URL, YOUTUBE, VTT}
  → enqueue BullMQ job { sourceId }
  → respond 202 immediately (sidebar shows the source with a yellow "indexing" dot)

Worker (separate process, consumes "ingestion" queue)
  → status = EXTRACTING → extract(type, originalUri) → text + raw location info
  → status = CHUNKING   → chunk(text)                → pieces w/ location
  → status = EMBEDDING  → embed(pieces)               → vectors (batched)
  → store: insert Chunk rows (Postgres) + upsert vectors (Qdrant)
  → status = READY, indexedAt = now()   (sidebar dot flips to green)
  on any error → status = FAILED, statusDetail = error message
                 (BullMQ retries per attempts/backoff before giving up)
```

**Re-index** = delete existing chunks for that `sourceId` (both stores, §3.3)
→ status back to `EXTRACTING` → re-run. `Source.id` stays stable.

**Extraction per type** — dispatcher pattern, one module per type, same
output contract (`{ text, rawLocationInfo }`):

| Type (matches UI tiles) | Library                                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| PDF                     | `pdf-parse`                                                                                                                                  |
| Text                    | direct file read                                                                                                                             |
| Web Link (URL)          | `fetch` + `@mozilla/readability` + `jsdom`; store extracted text as a snapshot (`rawContentRef`) so citations survive the live page changing |
| YT Link (YouTube)       | `youtube-transcript`                                                                                                                         |
| VTT                     | custom cue parser                                                                                                                            |

**Chunking** — fixed-size (~300–500 tokens, ~10–15% overlap) for prose types.
YouTube/VTT chunk on cue/sentence boundaries so timestamps stay meaningful.

---

## 6. Query pipeline (matches the finalized diagram exactly)

```
User Query
  │
  ├──► Step Back Prompt ─────┐
  ├──► Rewrite the query ────┤
  ├──► Sub Questions ────────┤── Query Routing ──► Adaptor
  └──► Perform HyDE ─────────┘   (fires one or more,
       │                          not mutually exclusive)
       └──► Hyde ──► Real Answers ─────────────────┘

Adaptor
  → routes to Vector Stores (Store-1..N), filtered by notebook_id
  → Retrieval of Chunks → Relevant Chunks (unranked candidates)
  → Ranking of chunks (cross-encoder rerank: R1, R2, R3, R4...)
  → Top K Chunks (1, 2, ...)

Top K Chunks + Query ──► LLM
  → LLM drafts an answer from the top-K chunks
  → C-RAG: is this grounded / are the chunks actually relevant enough?
      ├─ FAIL (↻) ──► loop back to Adaptor with a reformulated query
      │                (re-retrieve rather than force a weak answer)
      └─ PASS ──► Response + Structured Citations
```

**Query Routing** — a cheap classification step decides which transformation(s)
to fire. Not mutually exclusive: a compound, ambiguous question might trigger
rewrite + sub-questions + HyDE together, with results merged before reranking.
Build the "always retrieve once, no routing" path first; add routing as an
additive layer once you can see which questions actually need it.

**HyDE is structurally different from the other three** — it doesn't produce
a _query_ to route, it produces a _hypothetical answer_ which gets embedded
directly and searched against ("Real Answers" in the diagram = "treat the
model's guess at an answer as if it were retrieved text, and search near
it"). That's why it has its own arrow into the Adaptor rather than going
through "Query Routing" like the other three.

**Adaptor** — the abstraction that keeps query routing agnostic to _how many_
physical stores exist (§3.2). It fans a query (or several, if multiple
transformations fired) out to the relevant store(s) for the notebook and
merges candidates before handing off to rerank.

**C-RAG loop** — this is the correction mechanism, and it's a real loop back
to the Adaptor, not a dead end. If the top-K chunks don't actually address
the query (LLM-as-judge or a lightweight classifier), reformulate and
re-retrieve rather than generating from weak context. This is the main
defense against grounded-sounding hallucination and the mechanism behind
"say not found in sources instead of guessing." Cap the retry count (e.g. 1–2
loops) so a genuinely unanswerable question terminates in "not found in
sources" instead of looping forever.

**Response + Structured Citations** — the terminal node. `citations` is
always `[{ chunkId, sourceId, snippet }]` structured data (§3.1 `Answer.citations`),
never just inline `[1]` markers with nothing behind them — this is what the
source viewer (§8) is built on.

---

## 7. API surface

| Route                       | Purpose                                                            |
| --------------------------- | ------------------------------------------------------------------ |
| `POST /notebooks`           | create a notebook                                                  |
| `GET /notebooks/:id`        | notebook + its sources (for the sidebar)                           |
| `POST /sources`             | upload/add a source, enqueues ingestion (§5)                       |
| `GET /sources/:id/status`   | poll for the sidebar status dot (yellow/green)                     |
| `DELETE /sources/:id`       | remove a source — both stores, §3.3                                |
| `POST /sources/:id/reindex` | re-run ingestion, same `sourceId`                                  |
| `POST /query`               | runs §6 synchronously, returns `{ text, citations }`               |
| `GET /chunks/:id`           | resolve a citation to its text + `location`, for the source viewer |

---

## 8. Frontend — matches the wireframes

**Layout**: left sidebar (notebook nav + source list with status dots) +
main panel that's either the "Add Source" grid or the chat view.

**Sidebar**

- "Add Source" action at top.
- List of sources in the current notebook, each with a status dot:
  - yellow = `EXTRACTING` / `CHUNKING` / `EMBEDDING` (collectively "indexing")
  - green = `READY`
  - (add: red/gray = `FAILED`, not in the wireframe yet but needed for the
    "allow the source to be removed or re-indexed" requirement — a failed
    source needs a visible state and a retry action)

**Add Source panel** — five tiles matching `SourceType`: PDF, YT Link, Text,
VTT, Web Link. Each opens the relevant input (file picker for PDF/VTT, text
box for Text, URL input for YT Link/Web Link) and calls `POST /sources` with
the right `type`.

**Chat view** — query input at the bottom, message thread above, notebook
source list still visible on the left. Sending a query calls `POST /query`
and renders the returned `text` with citation markers derived from
`citations`, each clickable.

**Source viewer panel** — clicking a citation opens a right-hand panel
(matches the second wireframe's split layout) showing the actual source:

- PDF → render with `pdf.js`, scroll to `location.page`
- YouTube → embed IFrame Player API, seek to `location.startSeconds`
- Text/URL → render stored text, highlight `[charStart, charEnd]`
- VTT → render transcript list, scroll to `location.cueIndex`

This panel is fetched via `GET /chunks/:id` using the `chunkId` from the
clicked citation — the panel doesn't need its own separate state, it's driven
entirely by which citation was clicked.

---

## 9. Build order

1. Prisma schema + migrations, Notebook/Source CRUD routes, sidebar UI with
   source list — status dots hardcoded/manual at first, no ingestion yet.
2. BullMQ + Redis wired up: worker flips status `UPLOADING → READY` after a
   delay. Confirms the queue + status-polling plumbing before real logic.
3. Real ingestion for `TEXT` only: extract → chunk → embed → store in both
   Postgres and Qdrant. Confirm round-trip: search Qdrant → get id → fetch
   from Postgres → text matches.
4. Query pipeline, single-shot only (no routing, no rerank, no C-RAG): embed
   → search Qdrant (notebook-filtered) → fetch chunks → generate → structured
   citations. Wire up the chat UI against this.
5. Source viewer for `TEXT` — click a citation, see the highlighted range.
   This completes one full vertical slice: ingest → query → cite → view.
6. Add `PDF`, `Web Link`, `YT Link`, `VTT` — extraction + `location` shape +
   Add Source tile + viewer component, one at a time.
7. Add reranking, then the C-RAG check + loop-back, then query routing
   (rewrite / step-back / sub-questions / HyDE) — each additive to a working
   system, in that order.
8. `FAILED` status handling + re-index action in the sidebar.
9. Bonus: YouTube roadmap feature, built on existing chunks/citations, kept
   separable so it can't break the core loop.

---

## 10. Things to keep re-checking as you build

- Every Qdrant call includes the `notebook_id` filter — no exceptions.
- Delete/re-index touches every store that has data for that source (Postgres
  - Qdrant, and S3 if it's a PDF/VTT with an actual file) in one function,
    never partially.
- `rawContentRef` is always an S3 **key** (a string), never actual bytes —
  Postgres should never hold file contents directly.
- `Chunk.id` in Postgres and the Qdrant point `id` are always the same value.
- `Source.status` updates at every pipeline stage, not just at the end —
  that's what the sidebar dot reflects.
- C-RAG's fail path actually loops back to the Adaptor with a retry cap — it
  doesn't just log a warning and proceed anyway.
- Citations are always structured (`{chunkId, sourceId, snippet}`), never
  just inline text with nothing behind them.
