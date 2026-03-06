# Changelog

## [0.7.0] - 2026-03-06

### Added
- Added animated entry page (`/home`): Lottie brand animation plays on first load and on refresh from any app page; "Start Exploring" button navigates to landing page after 1.2s delay.
- Added landing page (`/`): restored full product-introduction page with login / register / guest-access entry points.
- Added exam countdown full-stack feature:
  - `courses.exam_date` nullable date column (`migrations/016_exam_date.sql`).
  - Backend: `ExamDateUpdate` model + `set_exam_date` service + `PATCH /admin/courses/{id}/exam-date` endpoint.
  - Frontend: `ExamCountdown` component with sm/lg sizes; three display states (>3 weeks / ≤3 weeks / ended).
  - Dashboard course cards show countdown badge; course-page top banner shows countdown.
  - Admin panel tab for setting/clearing exam date per course.
- Added StreamlineField dot-matrix particle flow: curve rendering replaced with point-array rendering; flow lines hug CampusHeroCard edge precisely.

### Fixed
- Fixed TypeScript build errors: `Course.exam_date` typed as optional, `MotionValue` type imports corrected.
- Fixed `ParticleText` animation causing infinite-loop freeze.
- Fixed Vercel build failure by regenerating `pnpm-lock.yaml`.
- Fixed footer copyright year to 2026.

### Changed
- Bumped backend API version to `0.7.0` (FastAPI `version` field in `main.py`).

---

## [0.6.0] - 2026-03-05

### Added
- Added async AI generation: POST endpoints return `{job_id}` within ~100ms; background `asyncio.create_task` runs generation; poll `GET /courses/{id}/jobs/{job_id}` for status (`pending → processing → done/failed`). Eliminates gateway timeouts.
- Added credits system: `credits` and `credit_orders` tables; AI generation and file unlocks deduct credits; HTTP 402 + structured `{detail, balance, required}` response on insufficient balance.
- Added file unlock system: all files uploaded by other users require credits to view (own uploads always free); unlock persisted in `user_unlocked_files`.
- Added `ExamMasterLogo` SVG component: pure SVG brand logo (4-pointed star + ascending-M mark), warm amber-gold `#D4A843`, replaces image-based logo site-wide.
- Added UI enhancements: feature card hover glow, hero connection lines made more transparent, hero subtitle lighter weight, AI knowledge nodes moved to negative space.

### Fixed
- Fixed 11 security items: JWT validation, SQL injection prevention, input sanitisation, rate-limit headers.
- Fixed test suite import paths and patch targets after async refactor; all 175 tests pass.
- Fixed credit balance display to update immediately after file unlock (no page refresh needed).
- Added FK constraint on `user_unlocked_files.artifact_id → artifacts.id ON DELETE CASCADE`.

### Changed
- Extracted `generate_service.py` from `generate.py`: pure synchronous functions callable via `asyncio.to_thread`.
- Added `job_service.py` for async job CRUD.
- Added `credit_service.py` for atomic credit deduction with optimistic locking.

---

## [0.5.0] - 2026-03-04

### Fixed
- Fixed invite code verification to occur before consumption; registration failure no longer consumes the code.
- Fixed insufficient-credits error to be uniformly HTTP 402 with structured response `{detail, balance, required}`.
- Fixed `InsufficientCreditsModal` redirect to `view=resources`.
- Fixed admin backend port fallback to port 8000.
- Fixed invite code statistics field name from `used_count` to `use_count` (matches DB schema).
- Fixed `ResourceHubTab` `isOwner` check from `user_id` to `uploaded_by` (matches `ArtifactOut`).
- Fixed `credits.py` admin secret validation to use `admin_secrets_set` (matches `admin.py`).

---

## [0.4.0] - 2026-03-03

### Added
- Added Multi-Model RAG pipeline (`/generate/ask`): 4-stage flow — pgvector retrieval → GPT-4o-mini filter → Gemini 2.0 Flash generate → Imagen 3 optional illustration.
- Added `gemini_service.py` for Gemini / Imagen 3 calls.
- Added `llm_key_service.py`: dynamic API keys with DB priority + env fallback and 60-second TTL cache.
- Added `api_keys` table and Admin panel "API Keys" tab for hot-swapping OpenAI / Gemini / DeepSeek keys without service restart.
- Added `python-docx` support for Word document parsing alongside existing pypdf.
- Added bilingual RAG recall: Chinese queries automatically trigger dual-path (Chinese + English) retrieval.

### Changed
- Changed `/generate/ask` from single-model to 4-stage multi-model pipeline.
- Changed API key resolution to prefer DB active records over `.env` values.

---

## [0.3.0] - 2026-02-19

### Added
- Added Content Guard (A): LLM-based PDF noise cleaning before indexing, with before/after char count comparison.
- Added Bilingual Mind Map (B): ECharts tree now supports 中文 Only / 中英对照 / English Only toggle.
- Added Mastery System (B): Double-click nodes to toggle mastery state (green border + pulse animation), persisted via localStorage.
- Added depth increase to 8 layers for knowledge graph (previously capped at 3).
- Added Dual-language fields (name_zh/name_en/desc_zh/desc_en) to graph generation prompt and tree validator.
- Added RAG Expert Hub page (/rag): 60/40 chat+map layout, image upload, source citations (file+page), mini mind map.
- Added Study Planner page (/planner): date range picker, automatic topic scheduling by priority, checkbox progress with balloons animation.
- Added Deep-Link buttons in Flashcard reviewer and Mistakes page: "🔍 详细解析" jumps to RAG hub with pre-filled query.
- Added Changelog sidebar expander: shows last 3 versions at the bottom of the sidebar.
- Added 16 new i18n keys for all new features (EN+ZH).

### Changed
- Changed sidebar navigation to include RAG hub at top and Study Planner.
- Changed graph prompt to output bilingual node fields for language toggle support.
- Changed _validate_tree max_depth from 3 to 8.

## [0.2.4] - 2026-02-18

### Added
- Added persistent Flashcards + Mistakes backend for v0.2.4:
  - `flashcards` table and `mistakes` table via `src/migrations/sql/005_flashcards_and_mistakes.sql`
  - dedup constraint `UNIQUE(user_id, flashcard_id)` and wrong-count upsert.
- Added flashcards/mistakes API server (`src/api_server.py`) with endpoints:
  - `POST /api/flashcards/generate`
  - `POST /api/flashcards/:id/review`
  - `GET /api/mistakes`
  - `GET /api/mistakes/review`
  - `POST /api/mistakes/:id/master`
  - `DELETE /api/mistakes/:id` (soft delete to `archived`).
- Added `/flashcards` page mixed-deck workflow:
  - scope-set based generation
  - MCQ + Knowledge mix (60/40)
  - progress `i/N`, Show Answer flip, `Known/Unknown` review actions
  - completion status with session accuracy summary.
- Added `/mistakes` page:
  - status/type filters
  - active mistakes review deck
  - per-item `Mark Mastered` and `Archive` actions.

### Changed
- Changed flashcards generation to v0.2.4 deck model backed by DB (`save_generated_flashcards`) instead of old course deck/card UI.
- Changed dashboard exam shortcuts to route to `/quiz` so top-level 5-route navigation remains consistent.
- Extended i18n dictionary (`src/i18n.py`) with flashcards/mistakes interaction texts for both EN/ZH.

### Fixed
- Fixed repeated `unknown` review behavior to upsert a single mistake row and increment `wrongCount` rather than creating duplicates.
- Fixed route refresh stability across all five routes (`/dashboard`, `/study`, `/quiz`, `/flashcards`, `/mistakes`).
- Fixed fallback flashcards generation path to avoid crashing on invalid API key by degrading to safe local fallback cards.

## [0.2.3] - 2026-02-18

### Added
- Added four dedicated generation pages with global switching:
  - `Summary`
  - `Graph`
  - `Outline`
  - `Quiz`
- Added Scope Set persistence:
  - new tables `scope_sets` and `scope_set_items`
  - default `All Materials` scope set per course
  - create/edit scope sets and auto-save file bindings.
- Added outputs reproducibility support for scope sets:
  - `outputs.scope_set_id`
  - persisted `scope_artifact_ids` remains available for replay.
- Added upgraded quiz interaction:
  - per-question submit workflow
  - bilingual answer + analysis shown under each question after submit
  - translation toggle with per-question cache and session call counter.

### Changed
- Changed `Study -> Generate` to launcher mode:
  - four buttons now redirect to dedicated generation pages.
- Changed output history presentation:
  - shows scope set name and selected file count
  - supports scope file list expansion for traceability.
- Changed generation binding:
  - summary/graph/outline/quiz all use current scope set artifact range.
- Changed navigation hierarchy:
  - main sidebar keeps top-level entries (`Dashboard / Study / Flashcards / Exam`)
  - generation pages moved under `Study / Generate` as sub-navigation.
- Changed generation page layout:
  - scope set selector + file bindings now render at the top of each generation page
  - added quick entry buttons to open latest summary/graph/outline/quiz outputs and jump directly.
- Changed scope set UX to a cleaner two-stage layout:
  - top: multi-select scope sets + quick create
  - bottom: edit files only for selected scope sets (tabbed when multiple selected).
- Changed sidebar navigation to button-based grouped navigation:
  - cleaner primary nav (`Dashboard / Study / Flashcards / Exam`)
  - study generation sub-navigation rendered as dedicated buttons.
- Changed scope set editor flow:
  - create-scope input was moved into the `Edit Current Scope Set Files` area
  - selected scope sets are edited in one place (single panel or tabs when multiple selected).

### Fixed
- Fixed repeated translation model calls for the same quiz question by introducing cache-backed toggle behavior.
- Fixed quiz answer reveal timing: answer/analysis now only available after per-question submit.
- Fixed route consistency between sidebar navigation and generation page switching.
- Fixed generation page coupling: `Graph` page now only renders graph generation + graph-only output history, while `Quiz` page keeps quiz-only controls.
- Fixed quiz runtime state model to explicit per-question maps:
  - `selected_option[qid]`
  - `submitted[qid]`
  - `is_correct[qid]`
  - `translation_on[qid]`
  - `translation_cache[qid]`
- Fixed `ValueError: invalid literal for int() with base 10: '1 (0)'` in scope set selector by adding robust session value coercion and migrating from single-select storage to multi-select storage.
- Fixed quiz page summary by adding end-of-page accuracy output.
- Fixed global page heading visibility:
  - UNSW app title/header now only renders on dashboard (home)
  - non-home pages (Study/Flashcards/Exam/Generation) no longer show the large global heading.
- Fixed accidental scope set deletion risk by adding explicit delete confirmation flow.

## [0.2.2] - 2026-02-18

### Added
- Added scope picker in `Study -> Generate`:
  - multi-select files from current course artifacts
  - default is all files selected
  - all generation buttons are disabled when no file is selected.
- Added scope-bound generation for summary/graph/syllabus/quiz:
  - generation context is built only from selected files
  - scope artifact IDs are persisted with each output for reproducibility.
- Added quiz generation in `Study -> Generate`:
  - size options `10`, `20`, `All (max 50)`
  - per-question card UI with `Translate This Question`
  - per-question answer and analysis shown in bilingual format.
- Added per-question translation cache with session call counter to avoid repeated model calls for the same question.
- Added migration `003_outputs_scope_quiz.sql`:
  - extends `outputs` with `output_type`, `scope_artifact_ids`, and `model_used`.

### Changed
- Changed outputs repository read/write model to support both legacy (`type`/`model`) and new (`output_type`/`model_used`) fields for backward compatibility.
- Changed `Study -> Outputs` presentation to include:
  - output type, time, scope file count
  - expandable scope file list
  - quiz output preview and download.
- Refreshed quiz generation prompt/schema to enforce strict JSON and bilingual answer/explanation fields.

## 0.2.1 - 2026-02-18

### Added
- Added course-first workflow with persistent `courses` table and sidebar course management (`course code + name` creation and selector).
- Added course-scoped artifact tracking:
  - uploaded PDFs are now persisted as `artifacts` records and bound to `course_id`.
- Added course output persistence and history:
  - new `outputs` table stores summary/graph/syllabus generation records (`course_id`, `type`, `scope`, `model`, `status`, `content/path`, `created_at`).
  - Study page includes an `Outputs` tab to review and download historical outputs.
- Added standalone `Flashcards` top-level navigation page with DB-backed deck/card model:
  - `decks` + `cards` tables
  - deck types: `vocab` and `mcq`
  - generation + review MVP flow.
- Added migration `002_course_workspace.sql` for new workspace schema (`courses`, `artifacts`, `outputs`, `decks`, `cards`).

### Changed
- Changed sidebar navigation from `Dashboard/Study/Exam` to `Dashboard/Study/Flashcards/Exam`.
- Changed Study page into course workspace tabs: `Upload`, `Generate`, `Outputs`, and `Q&A`.
- Changed indexing and generation flows to require an active selected course.
- Extended `scripts/self_check.py` to validate new schema tables and basic course/output/deck/card CRUD behavior.

## 0.2.0 - 2026-02-17
- Added app versioning with `VERSION` file and sidebar About section.
- Added SQLite schema migration system:
  - `src/migrations/migrate.py`
  - SQL migrations under `src/migrations/sql/`
  - automatic startup migration execution.
- Added migration backups:
  - `app.db` copied to `backups/app_<timestamp>.db`
  - `data/subjects` zipped to `backups/subjects_<timestamp>.zip` when present.
- Added Chroma index settings metadata:
  - `index_version`
  - `embedding_model_name`
  - `embedding_dim`
- Added index compatibility checks and rebuild warning in UI.
- Added global UI language switch (Chinese/English).
- Added optional PDF export dependency (`reportlab`) to requirements.
