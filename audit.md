# AxiomAI Project Audit

## 🔴 Critical Bugs

### 1. Multi-source RAG retrieves only 5 chunks globally
**File**: [`queryPipeline.ts:116`](file:///home/epsilon/Codedump/genai-cohort/AxiomAI/backend/src/queryPipeline.ts#L116)

`topK = populatedCandidates.slice(0, 5)` — only takes 5 chunks for the context window. With 2+ sources, all 5 could come from just one source. The model never sees the other source at all.

**Fix**: Search returns `6 results per query × 4 queries`, deduplicate, then take top `5 per source` OR a flat top-15. Also ensure at least 1 chunk per ready source is included.

---

### 2. Overview never regenerates when a 2nd (or 3rd) source is added
**File**: [`ingestionWorker.ts:149`](file:///home/epsilon/Codedump/genai-cohort/AxiomAI/backend/src/ingestionWorker.ts#L149)

```ts
if (!existingOverview) { // only fires if no overview exists
```

When you add a second source to a notebook that already has an overview, `existingOverview` is truthy so overview is **never regenerated** to include the new source. The summary stays stale.

**Fix**: Always regenerate overview after a new source finishes. The upsert in `overview.ts` handles idempotency.

---

### 3. Notebook delete doesn't clean up Qdrant vectors
**File**: [`server.ts:142`](file:///home/epsilon/Codedump/genai-cohort/AxiomAI/backend/src/server.ts#L142)

```ts
await db.notebook.delete({ where: { id } });
```

Cascade deletes DB rows, but never calls `deleteChunksBySourceId` for each source. Vector orphans pile up in Qdrant, consuming space and contaminating future searches.

**Fix**: Before deleting notebook, fetch all source IDs and delete their vectors from Qdrant.

---

### 4. Source delete has no auth check
**File**: [`server.ts:286`](file:///home/epsilon/Codedump/genai-cohort/AxiomAI/backend/src/server.ts#L286)

The `DELETE /api/sources/:id` route never checks that the authenticated user owns the source's notebook. Any logged-in user can delete another user's source by guessing the UUID.

**Fix**: Verify `source.notebook.ownerId === userId` before deletion.

---

## 🟡 Quality Issues

### 5. Overview text truncated at 15,000 chars per source, 40,000 total
**File**: [`overview.ts:46`](file:///home/epsilon/Codedump/genai-cohort/AxiomAI/backend/src/overview.ts#L46)

With a large PDF + a long video, only the first ~40k chars get summarized, so the overview misses later content.

**Fix**: Summarize each source separately first, then combine the per-source summaries into one overview.

---

### 6. YouTube chunker has no overlap between chunks
**File**: [`chunker.ts:29`](file:///home/epsilon/Codedump/genai-cohort/AxiomAI/backend/src/chunker.ts#L29)

```ts
currentText = "";   // hard reset, no overlap
```

Sentences crossing chunk boundaries are split without overlap, causing context loss at boundaries. The prose chunker has overlap (line 74) but YouTube doesn't.

**Fix**: Add a small overlap carry-over (last 1-2 segments) for YouTube/VTT chunking too.

---

### 7. Query pipeline runs 4 parallel embedding calls per query
**File**: [`queryPipeline.ts:64`](file:///home/epsilon/Codedump/genai-cohort/AxiomAI/backend/src/queryPipeline.ts#L64)

Each query fires 4 `getEmbedding()` calls in parallel (original, rewritten, step-back, HyDE). This is slow and expensive. They can be batched via `getEmbeddings([...])`.

**Fix**: Batch all 4 into a single `getEmbeddings()` call.

---

### 8. `db.js` is a duplicate of `db.ts`
**File**: [`db.js`](file:///home/epsilon/Codedump/genai-cohort/AxiomAI/backend/src/db.js) and [`db.ts`](file:///home/epsilon/Codedump/genai-cohort/AxiomAI/backend/src/db.ts)

There are two `db` files (`.js` and `.ts`). The `.js` version is likely a stale artifact. Only `db.ts` should exist.

---

### 9. `scratch.ts` left in `src/`
**File**: [`scratch.ts`](file:///home/epsilon/Codedump/genai-cohort/AxiomAI/backend/src/scratch.ts)

A scratch/test file committed to `src/`. Should be removed.

---

## Summary Table

| # | Severity | Issue | File |
|---|----------|-------|------|
| 1 | 🔴 Critical | Multi-source: only 5 chunks total, misses sources | queryPipeline.ts |
| 2 | 🔴 Critical | Overview never updates when 2nd source added | ingestionWorker.ts |
| 3 | 🔴 Critical | Notebook delete leaks Qdrant vectors | server.ts |
| 4 | 🔴 Critical | Source delete has no auth/ownership check | server.ts |
| 5 | 🟡 Quality | Overview truncated, misses tail content of large sources | overview.ts |
| 6 | 🟡 Quality | YouTube chunks have no overlap | chunker.ts |
| 7 | 🟡 Quality | 4 separate embedding calls instead of 1 batch | queryPipeline.ts |
| 8 | 🟡 Quality | `db.js` stale duplicate file | src/db.js |
| 9 | 🟡 Quality | `scratch.ts` committed to src/ | src/scratch.ts |
