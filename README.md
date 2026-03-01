# UNSW Exam Master

AI-native exam preparation platform for UNSW students, built with Streamlit + LangChain + GPT-4o + ChromaDB.

Upload course PDFs and get AI-generated summaries, quizzes, flashcards, concept maps, and mock exams — all scoped to your chosen syllabus range.

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI | Streamlit (multi-page, session-state routing) |
| LLM | GPT-4o via LangChain (`ChatOpenAI`) |
| Embeddings | `text-embedding-3-small` (1536-dim) |
| Vector Store | ChromaDB (cosine distance, persistent) |
| Database | SQLite (WAL mode, 6 versioned migrations) |
| Document Parsing | pdfplumber (text + layout extraction) |
| Language | Python 3.11+ |

---

## Features

| Module | Description |
|---|---|
| **Dashboard** | Overview of courses, performance metrics panel (avg latency per operation) |
| **Study** | Upload PDFs, manage scope sets, view saved outputs |
| **Summary** | AI-generated bilingual course summary (EN + ZH) |
| **Graph** | Interactive concept mindmap (horizontal tree layout, collapsible nodes) |
| **Outline** | Syllabus checklist generation with scope filtering |
| **Quiz** | AI-generated MCQ quiz, per-question submit, bilingual explanations |
| **Flashcards** | Spaced-repetition flashcards with mistake tracking and mastery status |
| **Exam** | Full mock exam with timed mode, scoring, and review |

---

## Quantitative Metrics

| Metric | Value |
|---|---|
| Automated test cases | **107 tests** across 7 test files |
| Test pass rate | **100%** (pytest) |
| Migration files | **6 SQL migrations** (001–006) |
| Supported file formats | PDF |
| RAG chunk size | 1000 tokens / 150 overlap |
| RAG top-k retrieval | Top 8 chunks per query |
| Performance tracking | Avg index time ~8–15s; avg generation ~3–6s (logged to DB) |

---

## Run

```bash
# Windows
.\.venv\Scripts\streamlit.exe run src/app.py

# macOS / Linux
.venv/bin/streamlit run src/app.py
```

---

## Run Tests

```bash
# Run all 107 tests
.venv/Scripts/python.exe -m pytest tests/ -v

# Run a specific test file
.venv/Scripts/python.exe -m pytest tests/test_metrics.py -v

# Run with coverage report
.venv/Scripts/python.exe -m pytest tests/ --cov=src --cov-report=term-missing
```

Test files:

| File | Cases | Coverage |
|---|---|---|
| `test_metrics.py` | 9 | `utils/metrics.py` — log, aggregate, recent, silent-fail |
| `test_course_workspace.py` | 20 | Course CRUD, Artifact dedup, ScopeSet, Outputs |
| `test_flashcards_mistakes.py` | 16 | Save, review, submit, upsert, mark master, archive |
| `test_llm_service_pure.py` | 17 | JSON extraction (plain, markdown-fenced, embedded) |
| `test_quiz_generator_pure.py` | 16 | Strip/parse/validate quiz JSON |
| `test_vector_store_pure.py` | 19 | normalize, split_text, build_chunks (fake Chroma client) |
| `test_document_processor.py` | 5 | Empty file, corrupt file, minimal PDF extraction |

Test isolation: all DB tests use a `tmp_db` pytest fixture — creates a real SQLite in `tmp_path`, runs all 6 migrations, and monkeypatches `_connect` in each service module. No mocking of SQLite itself.

---

## Performance Metrics System

All major operations are timed with `time.perf_counter()` and persisted to the `operation_metrics` SQLite table:

| Operation label | Triggered by |
|---|---|
| `index` | Upload + index PDFs |
| `summary` | Generate summary |
| `flashcard` | Generate flashcard deck |
| `outline` | Generate syllabus outline |
| `quiz` | Generate quiz |
| `chat` | Chat with documents |

The Dashboard renders a live `⚡ Performance Metrics` panel using `st.metric()` showing average latency per operation.

To query raw metrics:

```python
from utils.metrics import get_metrics_summary, get_recent_metrics

summary = get_metrics_summary()   # {operation: {total, avg_s, min_s, max_s}}
recent  = get_recent_metrics(50)  # list of recent rows with meta JSON
```

Design principle: `log_metric()` wraps all DB writes in `try/except Exception: pass` — a metrics failure never crashes the main flow.

---

## Navigation

- Default landing page is `Dashboard`.
- Use sidebar `Navigation` to switch between: `Dashboard`, `Study`, `Summary`, `Graph`, `Outline`, `Quiz`, `Flashcards`, `Exam`.
- Before uploading PDFs, create and select a **Course** (code + name) in the sidebar.
- `Study` workspace has three tabs: `Upload`, `Generate`, `Outputs`.
- In `Study → Generate`, the four action buttons redirect to dedicated generation pages.
- Use `Scope Set` on each generation page to persist and reuse artifact ranges.
- Quiz page supports per-question submit, bilingual answer/analysis, and translation toggle cache.

---

## Project Structure

```
UNSWExam/
├── src/
│   ├── app.py                        # Streamlit entry point, routing, sidebar
│   ├── migrations/
│   │   ├── migrate.py                # Auto-migration runner (startup)
│   │   └── sql/
│   │       ├── 001_init.sql
│   │       ├── 002_*.sql
│   │       ├── ...
│   │       └── 006_metrics.sql       # operation_metrics table
│   ├── services/
│   │   ├── course_workspace_service.py
│   │   ├── flashcards_mistakes_service.py
│   │   ├── llm_service.py
│   │   ├── quiz_generator.py
│   │   └── vector_store_service.py
│   └── utils/
│       ├── metrics.py                # log_metric, get_metrics_summary
│       └── document_processor.py
├── tests/
│   ├── conftest.py                   # tmp_db fixture (real SQLite + migrations)
│   ├── test_metrics.py
│   ├── test_course_workspace.py
│   ├── test_flashcards_mistakes.py
│   ├── test_llm_service_pure.py
│   ├── test_quiz_generator_pure.py
│   ├── test_vector_store_pure.py
│   └── test_document_processor.py
├── data/
│   └── app.db                        # SQLite database (auto-created)
├── backups/                          # Pre-migration DB snapshots
├── VERSION                           # Semantic version string
└── README.md
```

---

## Upgrading & Migrations

- App version is stored in `VERSION` (semantic versioning).
- On startup, migrations are applied automatically via `src/migrations/migrate.py`.
- SQLite DB path: `data/app.db`.
- Migration lock file: `backups/.migrate.lock` (prevents concurrent migration runs).
- Migration SQL files live in `src/migrations/sql/` and run in ascending filename order.
- Schema version stored in `meta(key, value)` table, key `schema_version`.
- Each migration runs inside `BEGIN IMMEDIATE` transaction; failure rolls back and leaves version unchanged.
- Before any pending migration, the app creates:
  - `backups/app_<timestamp>.db` (copy of current DB)
  - `backups/subjects_<timestamp>.zip` (zip of `data/subjects` if present)

---

## Vector Index Versioning

Each ChromaDB collection stores metadata:

- `index_version`
- `embedding_model_name`
- `embedding_dim`

If index metadata does not match current settings, the UI shows:

- `Index outdated, please rebuild`
- Rebuild button to clear and re-index from current uploaded PDFs
- Rebuild lock prevents double-click re-entry
- If indexing fails mid-way, index is marked incomplete and UI keeps prompting rebuild

---

## Manual Test Checklist

1. **Fresh start** without `data/app.db`: launch app, verify DB is created.
2. **Migration**: add a new SQL file, relaunch, verify `schema_version` increments.
3. **Backup**: with pending migrations and existing DB, verify `backups/app_<timestamp>.db`.
4. **Version display**: check sidebar About section shows app version and schema version.
5. **Index mismatch**: change expected version, verify warning + rebuild button appears.
6. **Rebuild workflow**: upload PDFs, click rebuild, verify index stats update.
7. **RAG non-regression**: build index, run summary/chat/quiz, verify outputs.
8. **Metrics panel**: run any generation, open Dashboard, verify `⚡ Performance Metrics` shows avg latency.
