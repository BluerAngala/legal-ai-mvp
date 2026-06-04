# Legal Knowledge Skill

## Overview

The Legal Knowledge Skill equips an AI agent to interact with the legal-ai-mvp knowledge management system. It handles ingestion, retrieval, and organization of legal documents including contracts, case law, statutes, regulations, and secondary sources. The system supports semantic search (embedding-based similarity) and keyword search (BM25-style exact/fuzzy matching), combining them in a hybrid ranker for optimal results.

**Core capabilities:**
- Upload and parse documents in PDF, DOCX, and TXT formats
- Full-text extraction with metadata preservation (party names, dates, jurisdiction, case citations)
- Semantic + keyword hybrid search across the knowledge base
- Collection-based organization by case type, jurisdiction, matter, or any custom taxonomy

**What this skill does NOT cover:**
- Legal analysis or drafting (see `legal-analysis.md` and `legal-docgen.md`)
- Court filing procedures or e-filing integration
- Authentication or user management

---

## When to use

Invoke this skill when any of the following triggers appear:

| Trigger phrase | Action |
|---|---|
| "upload" / "ingest" / "add document" / "import document" / "parse document" / "upload legal document" | `action::upload` |
| "search" / "find" / "look up" / "query" / "retrieve" / "search the knowledge base" / "find similar cases" / "find related documents" / "search for cases involving" / "what does the knowledge base say about" | `action::search` |
| "organize" / "collection" / "create collection" / "add to collection" / "tag" / "categorize" / "move to" / "label" / "manage collections" / "group documents" | `action::organize` |
| "list documents" / "show all documents" / "what documents do we have" / "document inventory" | `action::list` |
| "delete document" / "remove document" / "purge document" | `action::delete` |

---

## Prerequisites

Before performing any action, the agent MUST:

1. **Identify the target workspace.** Confirm which legal-ai-mvp workspace or tenant is in scope. If the user has not specified one, ask for clarification before proceeding.
2. **Check file accessibility.** Ensure the document to be uploaded exists at the provided path and is readable. For URL-based uploads, verify the URL is accessible and the target format is supported.
3. **Confirm overwrite behavior.** If a document with the same name already exists, confirm with the user whether to overwrite, rename, or skip.
4. **Verify collection existence.** Before adding a document to a collection, confirm the collection exists or create it as part of the action.

---

## Actions

### action::upload

**Purpose:** Ingest a legal document into the knowledge base, extracting its full text and metadata.

#### Supported formats

| Format | MIME types | Notes |
|---|---|---|
| PDF | `application/pdf` | Text-based PDFs; OCR on scanned documents requires pre-processing |
| DOCX | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | Preserves paragraph structure and tables |
| TXT | `text/plain` | UTF-8 assumed; specify encoding if non-ASCII content expected |

#### Step-by-step procedure

**Step 1 — Validate the file.**
```
Input:  file_path or URL
Check:  File extension is one of pdf, docx, txt
        File size is within configured limits (default: 50 MB)
        File is not corrupted (basic magic-byte check)
Output: File validated → proceed; otherwise → return error with reason
```

**Step 2 — Extract text and metadata.**

For **PDF:**
- Use the configured PDF extraction library (e.g., `pymupdf`, `pdfplumber`, or `pypdf`).
- Extract: full body text, page-level text blocks, headings (if detectable), tables (as structured text), and embedded metadata (author, creation date, subject).
- If the document is scanned (no extractable text layer), flag it and notify the user that OCR may be required before ingestion.

For **DOCX:**
- Use the configured DOCX extraction library (e.g., `python-docx`, `mammoth`).
- Extract: full body text preserving paragraph order, tables, and bullet lists.
- Extract document properties: title, author, created date, modified date.

For **TXT:**
- Read the file with the appropriate encoding (default: UTF-8).
- Split into paragraphs or chunks using blank-line separators.
- Treat the filename as the document title if no title metadata is provided.

**Step 3 — Extract legal-specific metadata.**

Attempt to identify and extract:
- **Party names** — parties to contracts, plaintiffs/defendants in litigation
- **Dates** — contract effective dates, filing dates, judgment dates, statute effective dates
- **Jurisdiction** — court name, governing law state/country, regulatory body
- **Case citations** — case names, reporter citations (e.g., "123 F.3d 456"), court docket numbers
- **Statutory citations** — statute name, code section (e.g., "Cal. Civ. Code § 1600")
- **Keywords / legal issues** — inferred tags such as "force majeure", "indemnification", "breach of contract"

If automatic extraction fails, prompt the user to provide key metadata manually.

**Step 4 — Compute embeddings.**

- Generate semantic embeddings for the document using the configured embedding model.
- Chunk strategy: use overlapping text chunks (default: 512 tokens per chunk, 128-token overlap) to balance recall and precision.
- Store embeddings in the vector store (configured provider: e.g., `pgvector`, `qdrant`, `chroma`).

**Step 5 — Store in the knowledge base.**

```
Input:  extracted_text, metadata, embeddings, file_path, file_type
Action: Create a document record in the database with:
        - document_id (UUID, auto-generated)
        - title (from metadata or filename)
        - source_file (original filename)
        - file_type
        - upload_timestamp (UTC now)
        - uploaded_by (agent identity or user principal)
        - text_content (full extracted text, stored for keyword indexing)
        - metadata JSON (party_names, dates, jurisdiction, citations, etc.)
        - chunk_ids (references to vector store chunks)
        - status: "indexed" | "pending_review" | "failed"
Output: document_id, status
```

**Step 6 — Return confirmation.**

Report back to the user:
- Document title and ID
- Number of pages / characters extracted
- Any metadata fields successfully auto-identified
- Any warnings (e.g., OCR needed, partial extraction, missing metadata)
- Confirmation of which collections (if any) the document was added to

#### Upload options

| Flag | Description | Default |
|---|---|---|
| `--collection <name>` | Add document to a named collection on upload | None |
| `--tags <tag1,tag2>` | Comma-separated list of tags | None |
| `--review` | Set status to `pending_review` instead of `indexed` | `indexed` |
| `--no-index` | Upload metadata only; defer embedding and indexing | False |
| `--jurisdiction <value>` | Override or set jurisdiction metadata | Auto-detected |

---

### action::search

**Purpose:** Find relevant legal documents in the knowledge base using hybrid semantic + keyword search.

#### Search pipeline

The search uses a **hybrid retrieval** approach:

1. **Semantic query** — embed the user's natural-language query and retrieve the top-K chunks by cosine similarity.
2. **Keyword query** — run a BM25 / dense-keyword search over the full-text index.
3. **RRF fusion** — combine both result sets using Reciprocal Rank Fusion (default `k=60`) to produce a unified ranked list.
4. **Re-ranking** — optionally re-rank results using a cross-encoder model for higher precision on the top-N results.

#### Step-by-step procedure

**Step 1 — Parse the query.**

```
Input:  Natural-language query from the user
Extract:
  - Primary query string (the legal question or search intent)
  - Filters: jurisdiction, date range, case type, collection, tags, file_type
  - Sort order: relevance | date_asc | date_desc | title_asc
Output: query_obj { query_string, filters, sort, limit, offset }
```

**Step 2 — Execute search.**

```
Semantic branch:
  Input:  query_string
  Action: Embed query → cosine similarity top-K against chunk index
  Output: result_set_semantic [{ document_id, chunk_id, score, snippet }]

Keyword branch:
  Input:  query_string
  Action: BM25 search over full-text index
  Output: result_set_keyword [{ document_id, chunk_id, score, snippet }]

Fusion:
  Input:  result_set_semantic, result_set_keyword
  Action: RRF rank combination → unified ranked list
  Output: fused_results [{ document_id, combined_score, sources }]
```

**Step 3 — Apply filters.**

Filter the fused results by any combination of:
- `jurisdiction` — exact match or hierarchical (e.g., "Federal" includes all federal courts)
- `date_range` — documents with metadata dates within `[start, end]`
- `case_type` — document-level classification
- `collection` — document belongs to a named collection
- `tags` — document has any/all of the specified tags
- `file_type` — `pdf`, `docx`, or `txt`

**Step 4 — Assemble and return results.**

```
Output format (per document):
{
  "document_id": "...",
  "title": "...",
  "source_file": "...",
  "jurisdiction": "...",
  "case_type": "...",
  "date": "...",
  "matched_chunks": [
    { "chunk_id": "...", "text": "...", "score": 0.94 }
  ],
  "collection": [...],
  "tags": [...]
}

Response to user:
- Number of results found
- Top results with context snippets (highlighting matched terms)
- Any applied filters stated explicitly
- Suggest refinements if results are sparse (e.g., "Try broadening your jurisdiction filter")
```

#### Search options

| Flag | Description | Default |
|---|---|---|
| `--collection <name>` | Limit search to a specific collection | All collections |
| `--jurisdiction <value>` | Filter by jurisdiction | None |
| `--tags <tags>` | Filter by tags (AND logic) | None |
| `--date-from <ISO>` | Filter documents from this date | None |
| `--date-to <ISO>` | Filter documents to this date | None |
| `--limit <N>` | Maximum results to return | 10 |
| `--offset <N>` | Pagination offset | 0 |
| `--semantic-only` | Skip keyword branch (pure embedding search) | False |
| `--rerank` | Apply cross-encoder re-ranking to top results | False |
| `--sort <field>` | Sort by: relevance, date_desc, date_asc, title_asc | relevance |

---

### action::organize

**Purpose:** Create, manage, and populate collections; apply and maintain tags across the knowledge base.

#### Collections

A **collection** is a named, user-defined grouping of documents. Collections are orthogonal to tags — a document can belong to any number of collections.

**Collection metadata:**
```json
{
  "collection_id": "UUID",
  "name": "string (unique within workspace)",
  "description": "string",
  "created_at": "ISO 8601 UTC",
  "created_by": "principal_id",
  "document_count": "integer",
  "filters": { "jurisdiction": "...", "case_type": "...", "tags": [...] }
}
```

**Note:** Collections can be defined either by explicitly adding documents or by a saved filter query. Filter-based collections are dynamically maintained — new documents matching the criteria are automatically included.

#### Step-by-step procedure

**Sub-action: create_collection**
```
Input:  name, description (optional), filter_criteria (optional)
Check:  Name is unique within the workspace
Action: Create collection record in database
Output: collection_id, name
```

**Sub-action: add_to_collection**
```
Input:  document_ids (list) or filter_criteria, collection_id or collection_name
Check:  All document IDs exist and collection exists
Action: Link documents to collection; if filter-based collection, save filter criteria
Output: confirmation with count of documents added
```

**Sub-action: remove_from_collection**
```
Input:  document_ids, collection_id
Action: Unlink documents from collection (does not delete documents)
Output: confirmation
```

**Sub-action: delete_collection**
```
Input:  collection_id
Check:  Confirm with user if collection contains documents
Action: Delete collection; documents remain in the knowledge base
Output: confirmation
```

**Sub-action: list_collections**
```
Action: Return all collections with document counts and descriptions
Output: [ { collection_id, name, description, document_count, created_at } ]
```

#### Tags

Tags are **flat, non-hierarchical labels** applied at the document level. Multiple tags per document are supported.

**Predefined tag categories** (recommended, not enforced):
- `case-type`: litigation, arbitration, transactional, regulatory, advisory
- `jurisdiction`: federal, state, international, EU, UK, CN, US-CA, US-NY, etc.
- `subject`: contract-drafting, ip, employment, m&a, compliance, litigation, privacy
- `stage`: draft, reviewed, executed, filed, archived
- `confidentiality`: public, internal, privileged, highly-sensitive

**Sub-action: add_tags**
```
Input:  document_ids, tags (list)
Action: Merge tags into each document's tag set (idempotent — duplicates ignored)
Output: confirmation per document
```

**Sub-action: remove_tags**
```
Input:  document_ids, tags (list)
Action: Remove specified tags from each document's tag set
Output: confirmation per document
```

**Sub-action: find_by_tag**
```
Input:  tag, collection (optional)
Action: Return all documents with the specified tag, optionally scoped to a collection
Output: [ document summaries ]
```

---

### action::list

**Purpose:** Return an inventory of documents in the knowledge base, optionally filtered.

```
Input:  filters (collection, jurisdiction, tags, date_range, file_type)
Action: Query document index with filters
Output: Table or list of documents with: id, title, collection(s), tags, jurisdiction, date, file_type, status, upload_date
```

---

### action::delete

**Purpose:** Remove a document from the knowledge base.

```
Input:  document_id(s) or document_name
Confirm: User must confirm before deletion
Action:
  1. Remove document record from database
  2. Delete associated chunks from vector store
  3. Remove document from all collections
Warning: Deletion is irreversible. Metadata (audit log) is retained.
Output: Confirmation of deleted document IDs
```

---

## Best Practices

### Document naming conventions

| Good | Bad | Reason |
|---|---|---|
| `Smith_v_Jones_2024-03-15_Opinion.pdf` | `document1.pdf` | Includes parties, date, and type |
| `Master_Service_Agreement_Acme_2024-01-01.pdf` | `MSA.pdf` | Includes counterparty and effective date |
| `GDPR_Article_17_Recital_84.pdf` | `privacy.pdf` | Includes specific statutory reference |

**Recommended pattern:** `[Parties/Subject]_[Document Type]_[Date]_[Optional Version].<ext>`

### Tagging strategies

1. **Be consistent.** Use a controlled vocabulary for case types and jurisdictions. Prefer hierarchical tags (e.g., `US > California > Civil`) over freeform strings.
2. **Limit redundancy.** If a document is in a jurisdiction-specific collection, avoid duplicating jurisdiction in the tags — use either collections OR tags, not both.
3. **Use tags for cross-cutting concerns.** Collections represent organizational groupings; tags represent document characteristics. A document about California employment law in a M&A matter might have: `tags: ["employment", "california", "m&a", "privileged"]` and be in collections: `["employment-disputes", "m&a-closing-docs"]`.
4. **Audit tags quarterly.** Run `find_by_tag` on common tags to identify inconsistently applied labels and clean up.

### Search optimization

1. **Query specificity.** More specific queries (e.g., "force majeure clause COVID-19 commercial lease") outperform vague ones ("lease"). Include legal terms of art.
2. **Use filters proactively.** If the user's question is clearly in a jurisdiction, apply the jurisdiction filter from the start to reduce noise.
3. **Citation-based retrieval.** If the user provides a case citation (e.g., "Brown v. Board of Education"), use it as a keyword filter alongside the semantic query for high precision.
4. **Result feedback.** After returning results, ask whether the results were helpful. If not, suggest broadening the search (remove filters, use `--semantic-only`) or narrowing (add jurisdiction or case-type filter).
5. **Chunk boundary awareness.** Long documents are chunked. A relevant passage might appear near a chunk boundary. If a result snippet seems incomplete, note that the full document contains additional relevant text.

---

## Examples

### Example 1: Upload a contract

> **User:** "Upload the executed NDA between Acme Corp and Beta LLC dated January 2024."

```
Agent action: action::upload
  file_path: "/uploads/Acme_Beta_NDA_2024-01-15_Executed.pdf"
  metadata:
    title: "Non-Disclosure Agreement — Acme Corp / Beta LLC"
    parties: ["Acme Corp", "Beta LLC"]
    date: "2024-01-15"
    document_type: "nda"
    file_type: "pdf"
  flags: --collection "confidential-agreements" --tags "nda,acme,beta,executed"

Expected output:
  Document uploaded successfully.
  ID: 7f3a9c12-...
  Title: Non-Disclosure Agreement — Acme Corp / Beta LLC
  Pages: 8
  Collections: [confidential-agreements]
  Tags: [nda, acme, beta, executed]
  Status: indexed
```

### Example 2: Search for relevant case law

> **User:** "Find cases about arbitration clauses in consumer contracts where the plaintiff won."

```
Agent action: action::search
  query_string: "arbitration clause consumer contract class action waiver plaintiff wins"
  flags: --limit 8 --rerank

Expected output:
  Found 8 relevant results (showing top 3):

  1. [Hart v. Rite Aid Corp, 2022]
      Jurisdiction: US-CA | Tags: [arbitration, consumer, class-action, plaintiff-win]
      Matched chunk: "The arbitration agreement's class action waiver is
      unconscionable under California law when imposed on a consumer
      as a non-negotiable take-it-or-leave-it contract..." [score: 0.91]

  2. [Doe v. Online Retailer Inc., 2021]
      Jurisdiction: US-CA | Tags: [arbitration, e-commerce, consumer]
      Matched chunk: "This court finds the arbitration clause unenforceable
      because the defendant failed to provide adequate notice..." [score: 0.87]

  3. [Nguyen v. Regional Bank, 2019]
      Jurisdiction: US-CA | Tags: [arbitration, financial-services]
      Matched chunk: "The arbitration agreement violated the Carmen Guadalupe
      rule requiring procedural conspicuousness..." [score: 0.85]

  Tip: Results are scoped to US-CA. To broaden, remove the --jurisdiction filter.
```

### Example 3: Create and populate a collection

> **User:** "Create a collection for our employment litigation matters and add all employment-related documents to it."

```
Agent action: action::organize

  Step 1 — Create collection:
    action: create_collection
    name: "employment-litigation"
    description: "Documents related to employment disputes and litigation"

  Step 2 — Find documents with employment tag:
    action: find_by_tag
    tag: "employment"

  Step 3 — Add to collection:
    action: add_to_collection
    document_ids: [list from step 2]
    collection_id: "<from step 1>"

Expected output:
  Collection created: employment-litigation (ID: e2b4f...)
  Found 12 documents with tag 'employment'.
  Added 12 documents to collection 'employment-litigation'.
  Collection document count: 12
```

### Example 4: Filtered search with collections

> **User:** "Search the M&A collection for documents about representations and warranties."

```
Agent action: action::search
  query_string: "representations and warranties R&W indemnification"
  flags: --collection "m&a-closing-docs" --limit 5

Expected output:
  Found 5 results in collection 'm&a-closing-docs':

  1. Stock Purchase Agreement — Alpha Bidco / TargetCo [PDF]
     Date: 2024-02-01 | Tags: [m&a, stock-purchase, representations-warranties]
     Matched: "The Seller represents and warrants that all financial
     statements are true and correct in all material respects..." [score: 0.93]

  2. SPA Schedule 4.7 — Material Liabilities Disclosure [XLSX]
     Date: 2024-02-01 | Tags: [m&a, disclosure-schedule]
     Matched: "Schedule 4.7 — Representations as to Material Liabilities..." [score: 0.89]
```

### Example 5: Bulk tagging

> **User:** "Tag documents 7f3a9c12, a1b2c3d4, and e5f6g7h8 as privileged."

```
Agent action: action::organize
  sub-action: add_tags
  document_ids: ["7f3a9c12", "a1b2c3d4", "e5f6g7h8"]
  tags: ["privileged"]

Expected output:
  Tags added:
    7f3a9c12 — Non-Disclosure Agreement — Acme Corp / Beta LLC ✓
    a1b2c3d4 — Smith v. Jones — Motion to Dismiss ✓
    e5f6g7h8 — Employment Agreement — Jane Doe ✓
```

---

## Error Handling

| Error | Cause | Resolution |
|---|---|---|
| `FILE_NOT_FOUND` | File path does not exist | Verify path; ask user for correct path |
| `UNSUPPORTED_FORMAT` | File type not PDF/DOCX/TXT | Notify user; suggest conversion |
| `EXTRACTION_FAILED` | Corrupt PDF or password-protected file | Ask user to provide password or uncompressed version |
| `DOCUMENT_EXISTS` | Document with same name already indexed | Prompt user: overwrite / rename / skip |
| `COLLECTION_NOT_FOUND` | Referenced collection does not exist | Offer to create it or list existing collections |
| `SEARCH_TIMEOUT` | Query exceeded time limit | Suggest narrower query or reduced result set |
| `EMBEDDING_SERVICE_UNAVAILABLE` | Vector store / embedding API down | Log error; return partial keyword-only results with notice |

On any error, report the error code, the affected document or query, and the recommended resolution. Do not silently skip errors.
