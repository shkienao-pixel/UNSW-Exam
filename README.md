# UNSW Exam Master

**[English](#english) | [中文](#中文)**

**Live:** https://exammaster.tech

---

<a name="english"></a>
# English

> An AI-powered exam preparation platform for international students. Upload course materials and let AI generate summaries, quizzes, flashcards, knowledge graphs, and provide intelligent Q&A.

## Table of Contents

- [Product Overview](#product-overview)
- [Tech Stack](#tech-stack)
- [System Architecture](#system-architecture)
- [Directory Structure](#directory-structure)
- [Database Design](#database-design)
- [API Routes](#api-routes)
- [Core Features](#core-features)
- [Deployment](#deployment)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [Database Migrations](#database-migrations)
- [Testing](#testing)
- [Admin Panel](#admin-panel)

---

## Product Overview

**UNSW Exam Master** is an invite-only AI exam prep web app with the following features:

| Feature | Description |
|---------|-------------|
| **AI Q&A (RAG)** | Multi-model retrieval-augmented Q&A grounded in uploaded materials, with citations and optional image generation |
| **Summary** | GPT-4o distills key knowledge points from course materials |
| **Quiz** | Generates de-duplicated multiple-choice questions, dynamically excluding previously seen topics |
| **Flashcards** | MCQ + knowledge card dual mode, with a mistakes book |
| **Knowledge Outline** | Two-stage build: material extraction + AI gap-filling, produces a tree-structured outline |
| **Knowledge Graph** | Visualizes concept nodes and relationships (Cytoscape.js) |
| **Review Plan** | Spaced repetition algorithm with exam countdown and daily task recommendations |
| **Admin Panel** | Manage courses, files, users, invite codes, API keys, and user feedback |

---

## Changelog

### v0.7.0 (2026-03-06)

**Features:**
- **Animated entry page** — `/home` route plays a Lottie brand animation on first load (and on any app-page refresh); "Start Exploring" button transitions to the landing page after 1.2s
- **Landing page restored** — `page.tsx` reset to the full product-introduction page with login / register / guest-access entry points
- **Exam countdown (full-stack)** — `courses.exam_date` column (migration 016); `PATCH /admin/courses/{id}/exam-date` admin endpoint; `ExamCountdown` component with sm/lg sizes and three states (>3 weeks / ≤3 weeks / ended); integrated into dashboard course cards and course-page banner
- **StreamlineField rewrite** — curve rendering replaced with dot-matrix particle flow (no bright points); campus hero card flow lines hug the card edge precisely

**Fixes:**
- TypeScript build errors resolved (`Course.exam_date` optional typing, `MotionValue` type imports)
- `ParticleText` infinite-loop freeze fixed
- `pnpm-lock.yaml` regenerated to unblock Vercel build failure
- Footer copyright year corrected to 2026

---

### v0.6.0 (2026-03-05)

**Features:**
- **Async AI generation** — POST returns `{job_id}` within ~100ms; background asyncio task runs generation; poll `GET /jobs/{id}` for status. No more gateway timeouts on long-running jobs
- **Credits system** — Users hold a balance (`credits` table); AI generation and file unlocks deduct credits (HTTP 402 with structured response on insufficient balance)
- **File unlock system** — All files uploaded by others require credits to view (own uploads are always free); unlock persisted in `user_unlocked_files`
- **ExamMasterLogo SVG component** — Pure SVG logo (4-pointed star + E + ascending-M mark), warm amber-gold `#D4A843`, replaces image-based logo across entire site
- **UI refresh** — Feature card hover glow, hero connection lines made more transparent, hero subtitle lighter weight, Hero AI nodes moved to negative space beside card

**Fixes & Refactors:**
- 11 security hardening items (JWT validation, SQL injection prevention, input sanitisation, rate-limit headers)
- `generate_service.py` extracted from `generate.py` for clean async job execution (pure synchronous functions callable from `asyncio.to_thread`)
- `job_service.py` added for job CRUD (`pending → processing → done/failed`)
- `credit_service.py` added for atomic credit deduction with optimistic locking
- Credit balance display updates immediately after file unlock (no page refresh needed)
- FK constraint added on `user_unlocked_files.artifact_id → artifacts.id ON DELETE CASCADE`
- Test suite: all 175 tests pass after async refactor (fixed import paths and patch targets)

---

### v0.5.0 (2026-03-04)

**Fixes:**
- Invite code verification before consumption; registration failure does not consume code
- Insufficient credits error unified to HTTP 402 with structured response `{detail, balance, required}`
- InsufficientCreditsModal redirect corrected to `view=resources`
- Admin backend port fallback unified to port 8000
- Invite code statistics field `used_count` corrected to `use_count` (matches DB schema)
- ResourceHubTab `isOwner` check changed from `user_id` to `uploaded_by` (matches ArtifactOut)
- credits.py admin secret validation changed to use `admin_secrets_set` (matches admin.py)

---

## Tech Stack

### Backend

| Component | Version / Choice |
|-----------|-----------------|
| **Framework** | FastAPI 0.111+ |
| **Runtime** | Python 3.12, Uvicorn |
| **Database** | Supabase PostgreSQL (managed) |
| **Vector Store** | ChromaDB (persistent on VPS disk) |
| **File Storage** | Supabase Storage (signed URLs, 10-year expiry) |
| **AI — Q&A** | GPT-4o-mini (filter) + Gemini 2.0 Flash (generate) + Imagen 3 (illustration) |
| **AI — Generation** | GPT-4o (summary / quiz / flashcards / outline) |
| **AI — Feedback** | DeepSeek Chat |
| **Embedding** | OpenAI text-embedding-3-small |
| **PDF parsing** | pypdf |
| **Word parsing** | python-docx |
| **Testing** | pytest (175 tests) |

### Frontend

| Component | Version / Choice |
|-----------|-----------------|
| **Framework** | Next.js 16 (App Router) |
| **Language** | TypeScript |
| **Styling** | Tailwind CSS v4 |
| **Knowledge Graph** | Cytoscape.js |
| **Markdown** | react-markdown |
| **Auth** | Supabase JS SDK (JWT in localStorage) |
| **Icons** | Lucide React |

### Infrastructure

| Component | Configuration |
|-----------|--------------|
| **Frontend** | Vercel (auto CI/CD on push to main) |
| **Backend** | Hostinger VPS, Ubuntu 22.04, Docker Compose |
| **Reverse Proxy** | Nginx (SSL termination, Let's Encrypt TLS, 300s timeout) |
| **Domains** | `exammaster.tech` (frontend), `api.exammaster.tech` (backend) |
| **Database** | Supabase (PostgreSQL + Auth + Storage) |

---

## System Architecture

```
Browser
    │
    ├── https://exammaster.tech          (Vercel — Next.js)
    │       ├── /login  /register
    │       ├── /dashboard               Course list
    │       ├── /courses/[id]            Main feature page (Q&A / generate / outline / graph / review)
    │       ├── /mistakes                Mistakes book
    │       └── /admin                   Admin panel (X-Admin-Secret auth)
    │
    └── https://api.exammaster.tech      (Hostinger VPS)
            │
            ├── Nginx (80→443 redirect + SSL + 300s timeout)
            │
            └── FastAPI (Docker, port 8002)
                    ├── Supabase PostgreSQL  ← metadata / user data
                    ├── Supabase Storage     ← PDF / Word files
                    ├── ChromaDB (VPS disk)  ← vector index
                    └── AI APIs              ← OpenAI / Gemini / DeepSeek
```

### RAG Q&A — 4-Stage Pipeline

```
User question
  │
  ▼ Stage 1 — Retrieval
  ChromaDB cosine similarity → top-6 chunks
  (Chinese queries: auto bilingual translation → dual-path recall)
  │
  ▼ Stage 2 — Filtering
  GPT-4o-mini: remove chunks irrelevant to the question
  │
  ▼ Stage 3 — Generation
  Gemini 2.0 Flash: produce cited answer grounded in filtered chunks
  │
  ▼ Stage 4 — Illustration (optional)
  Imagen 3: generate visual aid for complex concepts
```

### File Processing Pipeline

```
File upload (Admin or user)
  │
  ▼
Supabase Storage upload
  path: {course_id}/{sha256[:12]}_{filename}
  │
  ▼  After admin approval (async background task)
rag_service.process_artifact()
  ├── 1. Download file bytes from Storage
  ├── 2. Extract text (pypdf / python-docx)
  ├── 3. Clean text (remove page numbers, headers, garbage)
  ├── 4. Chunk (~800 chars, 100-char overlap)
  ├── 5. Embed (text-embedding-3-small)
  ├── 6. Store in ChromaDB (vector index)
  └── 7. Store in artifact_chunks table (plaintext backup)
```

---

## Directory Structure

```
UNSW-Exam/
├── backend/                        # FastAPI backend
│   ├── app/
│   │   ├── main.py                 # App entry, CORS, router registration
│   │   ├── core/
│   │   │   ├── config.py           # Environment config (pydantic-settings)
│   │   │   ├── dependencies.py     # get_db, get_current_user injection
│   │   │   ├── exceptions.py       # AppError / AuthError / NotFoundError...
│   │   │   └── supabase_client.py  # Supabase client singleton
│   │   ├── models/
│   │   │   ├── auth.py             # RegisterRequest, LoginRequest, TokenResponse
│   │   │   ├── course.py           # CourseOut, ArtifactOut
│   │   │   ├── flashcard.py        # Flashcard, FlashcardDeck
│   │   │   └── generation.py       # GenerateResponse, QuizQuestion
│   │   ├── routers/
│   │   │   ├── auth.py             # /auth/* — register/login/refresh/logout
│   │   │   ├── courses.py          # /courses/* — CRUD
│   │   │   ├── artifacts.py        # /courses/{id}/artifacts — user uploads
│   │   │   ├── scope_sets.py       # /courses/{id}/scope-sets
│   │   │   ├── outputs.py          # /courses/{id}/outputs — generation history
│   │   │   ├── content.py          # /courses/{id}/content — chunk queries
│   │   │   ├── generate.py         # /courses/{id}/generate/* — AI generation
│   │   │   ├── review.py           # /review/* — review plan
│   │   │   ├── knowledge.py        # /knowledge/* — outline / graph
│   │   │   ├── feedback.py         # /feedback + /admin/feedback
│   │   │   └── admin.py            # /admin/* — admin endpoints
│   │   └── services/
│   │       ├── rag_service.py      # Full RAG pipeline (extract/chunk/embed/retrieve/purge)
│   │       ├── artifact_service.py # Supabase Storage upload/download/delete
│   │       ├── course_service.py   # Course/artifact DB operations
│   │       ├── generate_service.py # Core AI generation logic (run_summary/quiz/outline/flashcards)
│   │       ├── job_service.py      # Async job CRUD (pending → processing → done/failed)
│   │       ├── credit_service.py   # Credit deduction with optimistic locking
│   │       ├── llm_adapter.py      # OpenAI client lazy-load wrapper
│   │       ├── llm_key_service.py  # Dynamic API keys (DB priority + env fallback, 60s TTL)
│   │       └── gemini_service.py   # Gemini / Imagen3 calls
│   ├── migrations/                 # All DB migration SQL (001~016, run in order)
│   ├── tests/                      # pytest tests (175 total)
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/                       # Next.js 16 frontend
│   └── src/
│       ├── app/
│       │   ├── (auth)/             # Route group: no login required
│       │   │   ├── login/
│       │   │   └── register/
│       │   ├── (app)/              # Route group: login required
│       │   │   ├── dashboard/      # Course list + create course
│       │   │   ├── courses/[id]/   # Main feature page
│       │   │   └── mistakes/       # Mistakes book
│       │   ├── admin/              # Admin panel (single page, multi-tab)
│       │   └── api/                # Next.js Route Handlers (backend proxy)
│       ├── components/
│       │   ├── course/             # Course page components
│       │   ├── flashcard/          # Flashcard components
│       │   ├── generation/         # Generation result display
│       │   ├── KnowledgeTab.tsx    # Knowledge outline + graph tab
│       │   ├── MistakesView.tsx    # Mistakes book view
│       │   └── ReviewOutlineTab.tsx # Review outline tab
│       └── lib/
│           ├── api.ts              # All backend API calls (with Chinese error messages)
│           ├── types.ts            # Global TypeScript type definitions
│           ├── auth-context.tsx    # Global auth state (AuthContext)
│           ├── i18n.tsx            # Bilingual (Chinese / English)
│           └── mistakes-store.ts   # Local mistakes state
│
├── nginx/
│   └── nginx.conf                  # HTTP→HTTPS redirect + SSL + reverse proxy
├── docker-compose.yml              # backend + nginx orchestration
└── openapi.json                    # OpenAPI 3.1 spec (auto-generated)
```

---

## Database Design

All tables are in Supabase PostgreSQL `public` schema. **RLS is disabled** — auth is enforced at the code layer.

### Core Tables

| Table | PK | Description |
|-------|----|-------------|
| `courses` | UUID | Courses (globally shared, visible to all users) |
| `artifacts` | BIGSERIAL | Uploaded file metadata (file_type, doc_type, status, storage_path) |
| `artifact_chunks` | BIGSERIAL | File chunks in plaintext (fallback retrieval) |
| `scope_sets` | BIGSERIAL | Scope sets (select which files participate in AI generation) |
| `scope_set_items` | Composite | Scope set ↔ artifact many-to-many |
| `outputs` | BIGSERIAL | AI generation history (summary/quiz/outline/flashcards/graph) |
| `flashcards` | UUID | Flashcards (mcq / knowledge dual type) |
| `mistakes` | BIGSERIAL | Mistakes book (linked to flashcard_id, wrong_count) |
| `invites` | UUID | Invite codes (code, max_uses, used_count) |
| `api_keys` | UUID | Dynamic API keys (provider: openai/gemini/deepseek) |
| `review_settings` | UUID | Review plan config (review_start_at, exam_at) |
| `review_node_progress` | UUID | Node-level review progress (done, priority, next_review_at) |
| `knowledge_nodes` | UUID | Knowledge outline nodes (is_ai_generated flag) |
| `knowledge_edges` | UUID | Knowledge graph edges (source, target, relation, confidence) |
| `user_feedback` | UUID | User feedback (status: pending/in_progress/resolved) |
| `credits` | UUID | User credit balance (balance, last_updated) |
| `credit_orders` | UUID | Credit transaction log (amount, reason, balance_after) |
| `user_unlocked_files` | Composite | Files unlocked by a user (user_id + artifact_id) |
| `generation_jobs` | UUID | Async generation jobs (status, job_type, output_id, error_msg) |

### `artifacts.doc_type` Semantic Categories

| Value | Label | RAG Note |
|-------|-------|----------|
| `lecture` | Lecture notes | Default |
| `tutorial` | Tutorial / Lab | — |
| `revision` | Revision summary | AI prioritizes these |
| `past_exam` | Past exam papers | AI prioritizes these |
| `assignment` | Assignment / Project | — |
| `other` | Other | — |

---

## API Routes

### Auth (`/auth`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Register (requires invite code) |
| POST | `/auth/login` | Login, returns JWT |
| POST | `/auth/refresh` | Refresh access_token |
| POST | `/auth/logout` | Logout |
| GET | `/auth/me` | Current user info |

### Courses & Files (`/courses`)

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/courses` | List / create courses |
| GET/DELETE | `/courses/{id}` | Get / delete course |
| GET/POST | `/courses/{id}/artifacts` | List approved files / user upload (status=pending) |
| DELETE | `/courses/{id}/artifacts/{aid}` | Delete file |
| GET/POST | `/courses/{id}/scope-sets` | Scope set management |
| GET | `/courses/{id}/outputs` | AI generation history |
| GET | `/courses/{id}/content/chunks` | Get chunk plaintext |

### AI Generation (`/courses/{id}/generate`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/generate/summary` | Generate summary (GPT-4o) |
| POST | `/generate/quiz` | Generate quiz (GPT-4o, supports exclude_topics) |
| POST | `/generate/outline` | Generate study outline (GPT-4o) |
| POST | `/generate/flashcards` | Generate flashcards (GPT-4o) |
| POST | `/generate/ask` | Intelligent Q&A (4-stage RAG pipeline) |
| POST | `/generate/translate` | Translate content |
| GET | `/courses/{id}/jobs/{job_id}` | Poll async generation job status |

### Knowledge Outline & Graph (`/knowledge`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/knowledge/build` | Build outline + graph (two stages) |
| GET | `/knowledge/outline` | Get outline (`?course_id=`) |
| GET | `/knowledge/graph` | Get knowledge graph |
| GET | `/knowledge/node` | Get single node detail |

### Review Plan (`/review`)

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/review/settings` | Review config (start date / exam date) |
| GET/POST | `/review/progress` | Node learning progress |
| POST | `/review/today_plan` | Today's recommended nodes (spaced repetition) |

### Admin (`/admin`, requires `X-Admin-Secret` header)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/courses` | List all courses |
| POST | `/admin/courses` | Create course |
| DELETE | `/admin/courses/{id}` | Delete course |
| GET | `/admin/artifacts` | List all files (including pending) |
| POST | `/admin/artifacts/upload` | Admin upload (auto-approved + triggers RAG) |
| POST | `/admin/artifacts/url` | Admin add URL resource |
| PATCH | `/admin/artifacts/{id}/approve` | Approve file (triggers background RAG) |
| PATCH | `/admin/artifacts/{id}/reject` | Reject file (purges ChromaDB vectors) |
| PATCH | `/admin/artifacts/{id}/doc-type` | Update file category (syncs ChromaDB) |
| GET | `/admin/users` | List all users |
| GET/POST | `/admin/invites` | Invite code management |
| GET/POST | `/admin/api-keys` | API key management |
| PATCH | `/admin/api-keys/{id}/activate` | Activate / deactivate key |
| DELETE | `/admin/api-keys/{id}` | Delete key |
| GET | `/admin/feedback` | List user feedback |
| GET | `/admin/feedback/ai-summary` | DeepSeek analysis → structured PM report |
| PATCH | `/admin/feedback/{id}` | Update feedback status |

### User Feedback

| Method | Path | Description |
|--------|------|-------------|
| POST | `/feedback` | Submit feedback (login required) |

---

## Core Features

### Invite-Only Registration

Registration requires an invite code (`invites` table). Admins generate codes via `/admin/invites`. Each code supports a configurable max-use limit.

### File Review Workflow

```
User upload → status=pending → awaits admin review
  ├── Approve → status=approved → background RAG processing (chunk + embed)
  └── Reject  → status=rejected → purge ChromaDB vectors + artifact_chunks
```

Admin direct uploads skip the review flow and immediately trigger RAG.

### Dynamic API Key Management

Key priority: **DB active record (60s TTL cache) > .env file**

Supported providers: `openai`, `gemini`, `deepseek`

Keys can be hot-swapped from the Admin panel without restarting the service.

### De-duplicated Quiz Generation

Quiz generation accepts `exclude_topics` (list of previously generated topics). The system prompt explicitly instructs the LLM to avoid those topics, preventing repeat questions across multiple generation rounds.

### Two-Stage Knowledge Outline

- **Stage 1 (Grounded)**: Extracts entirely from artifact_chunks text. Nodes marked `is_ai_generated=false`.
- **Stage 2 (AI Fill, optional)**: AI identifies knowledge gaps and fills them. Nodes marked `is_ai_generated=true` with confidence level.

### Spaced Repetition Review Algorithm

The daily plan (`/review/today_plan`) considers:
- Exam countdown (days remaining)
- Node priority (high / medium / low)
- Time since last review (longer gap = higher priority)
- Daily time budget (minutes)

---

## Deployment

### VPS Update Workflow

```bash
ssh root@<VPS_IP>
cd /opt/exammaster
git pull
# Full rebuild (Dockerfile or requirements.txt changed):
docker compose up -d --build backend
# Code-only change (no rebuild needed):
docker compose up -d backend
```

Diagnostics:

```bash
docker compose ps                      # Check container health
docker compose logs -f backend         # Tail live logs
docker compose logs --tail=50 backend  # Last 50 lines
```

### Frontend Deployment

Push to `main` → Vercel auto-builds. Required env var:

```
NEXT_PUBLIC_API_URL=https://api.exammaster.tech
```

---

## Local Development

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # Fill in secrets
uvicorn app.main:app --reload --port 8000
# Swagger UI: http://localhost:8000/docs
```

### Frontend

```bash
cd frontend
npm install
# Create frontend/.env.local:
# NEXT_PUBLIC_API_URL=http://localhost:8000
# NEXT_PUBLIC_SUPABASE_URL=...
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...
npm run dev
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_ANON_KEY` | ✅ | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key |
| `OPENAI_API_KEY` | ✅ | OpenAI key (also configurable via Admin panel) |
| `GEMINI_API_KEY` | — | Google Gemini key (also via Admin panel) |
| `DEEPSEEK_API_KEY` | — | DeepSeek key (feedback AI analysis) |
| `ADMIN_SECRET` | ✅ | Admin auth key (`X-Admin-Secret` header) |
| `ADMIN_SECRET_EXTRA` | — | Extra admin keys (comma-separated) |
| `APP_ENV` | — | `development` / `production` (affects CORS) |
| `CORS_ORIGINS` | — | Allowed frontend origins (comma-separated) |
| `SUPABASE_STORAGE_BUCKET` | — | Storage bucket name, default `artifacts` |

### Frontend (`frontend/.env.local`)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend API URL |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |

---

## Database Migrations

SQL files are in `backend/migrations/`. **Run manually in Supabase SQL Editor in order:**

| File | Content |
|------|---------|
| `001_schema.sql` | Initial schema (courses, artifacts, scope_sets, outputs, flashcards, mistakes) |
| `002_indexes_rls.sql` | Indexes + RLS (RLS effectively disabled) |
| `003_artifacts_v2.sql` | Artifacts extended fields (status, storage_path, storage_url, file_type) |
| `004_courses_shared.sql` | Courses made globally shared |
| `005_artifacts_nullable_user.sql` | artifacts.user_id made nullable |
| `006_artifact_chunks.sql` | artifact_chunks table |
| `007_invites.sql` | Invite codes table |
| `008_api_keys.sql` | Dynamic API keys table |
| `009_review_plan.sql` | review_settings + review_node_progress |
| `010_artifact_doc_type.sql` | artifacts.doc_type column |
| `011_user_feedback.sql` | user_feedback table |
| `012_credits.sql` | credits + credit_orders tables |
| `013_credit_orders.sql` | credit_orders extensions |
| `014_unlocked_files.sql` | user_unlocked_files table |
| `015_generation_jobs.sql` | generation_jobs table |
| `016_fk_unlocked_files.sql` | FK constraint: user_unlocked_files.artifact_id → artifacts.id |

---

## Testing

```bash
cd backend
pytest tests/ -v
# 175 passed
```

| File | Coverage |
|------|----------|
| `test_routes.py` | FastAPI routes end-to-end (health check, auth flow) |
| `test_models.py` | Pydantic model validation (Course, Artifact, DocType) |
| `test_generate_utils.py` | LLM output JSON parsing utilities |
| `test_feedback.py` | Feedback CRUD endpoints (with admin auth) |
| `test_doc_type.py` | doc_type enum, labels, valid value checks |
| `test_exceptions.py` | Exception class hierarchy |
| `test_rag_service.py` | RAG text extraction / cleaning / chunking |
| `test_rag_routing.py` | doc_type routing (file filtering during retrieval) |

---

## Admin Panel

Access `/admin` and enter the `X-Admin-Secret` in the UI.

**7 management tabs:**

| Tab | Functions |
|-----|-----------|
| Course Management | Create / delete courses |
| File Management | Approve/reject uploads, edit doc_type, admin direct upload |
| User Management | View all registered users |
| Invite Codes | Generate / view invite codes and usage |
| API Keys | Hot-swap OpenAI / Gemini / DeepSeek keys |
| User Feedback | View feedback, update status |
| AI Feedback Analysis | DeepSeek generates a structured PM report (bugs / UX / requests / action items) |

---
---

<a name="中文"></a>
# 中文

> 面向海外留学生的 AI 驱动考试复习平台。上传课程资料，AI 自动生成摘要、测验、闪卡、知识图谱，并提供智能问答。

## 目录

- [产品概述](#产品概述)
- [技术栈](#技术栈)
- [系统架构](#系统架构)
- [目录结构](#目录结构)
- [数据库设计](#数据库设计)
- [API 路由总览](#api-路由总览)
- [核心功能详解](#核心功能详解)
- [部署说明](#部署说明)
- [本地开发](#本地开发)
- [环境变量](#环境变量)
- [数据库迁移](#数据库迁移)
- [测试](#测试)
- [Admin 面板](#admin-面板)

---

## 产品概述

**UNSW Exam Master** 是一个邀请制的 AI 考试复习 Web 应用，主要功能：

| 功能 | 说明 |
|------|------|
| **AI 问答（RAG）** | 基于上传资料的多模型检索增强问答，回答带出处、可选生成配图 |
| **摘要生成** | GPT-4o 自动提炼课程核心知识点 |
| **测验生成** | 生成防重复多选题，动态排除已出过的题目主题 |
| **闪卡** | MCQ + 知识点双模式闪卡，配错题本 |
| **知识大纲** | 两阶段构建：资料抽取 + AI 知识补全，生成树形大纲 |
| **知识图谱** | 可视化知识节点及关联关系（Cytoscape.js） |
| **复习计划** | 间隔重复算法，考试倒计时 + 今日任务推荐 |
| **Admin 后台** | 课程、文件、用户、邀请码、API 密钥、用户反馈管理 |

---

## 更新日志

### v0.7.0（2026-03-06）

**新功能：**
- **动效入口页** — `/home` 路由在首次加载及任意 app 内页刷新时播放 Lottie 品牌动效；"开始探索"按钮等待 1.2s 后跳转落地页
- **落地页恢复** — `page.tsx` 恢复为完整产品介绍页，提供登录 / 注册 / 访客入口
- **考试倒计时（全栈）** — 新增 `courses.exam_date` 字段（migration 016）；Admin 接口 `PATCH /admin/courses/{id}/exam-date`；`ExamCountdown` 组件支持 sm/lg 两种尺寸及三态显示（>3周 / ≤3周 / 已结束）；集成至 Dashboard 课程卡片与课程页顶部横幅；管理员面板支持设置/清除考试日期
- **StreamlineField 重构** — 曲线渲染改为点阵粒子流（无亮点），流线精确贴合 CampusHeroCard 卡片边缘

**修复项：**
- TypeScript 构建错误修复（`Course.exam_date` 可选类型、`MotionValue` 类型引入）
- `ParticleText` 无限循环冻结问题修复
- 更新 `pnpm-lock.yaml` 解决 Vercel 构建失败
- 页脚版权年份修正为 2026

---

### v0.6.0（2026-03-05）

**新功能：**
- **AI 生成异步化** — POST 约 100ms 内返回 `{job_id}`，生成在后台 asyncio 任务中执行，轮询 `GET /jobs/{id}` 获取状态。彻底解决网关超时问题
- **积分系统** — 用户持有积分余额；AI 生成和文件解锁扣除积分；余额不足返回 HTTP 402 + 结构化响应
- **文件解锁系统** — 所有他人上传的文件均需积分解锁才可查看（自己上传的永远免费）；解锁记录持久化到 `user_unlocked_files`
- **ExamMasterLogo SVG 组件** — 纯 SVG 品牌 Logo（四角星 + E + 上升 M），暖琥珀金 `#D4A843`，全站统一使用
- **UI 视觉优化** — 功能卡片悬停发光、Hero 连接线降透明度、副标题字重减轻、AI 知识节点移至负空间两侧

**修复与重构：**
- 11 项安全加固（JWT 校验、SQL 注入防护、输入清洗、限速响应头）
- `generate_service.py` 从 `generate.py` 中抽取，纯同步函数供 `asyncio.to_thread` 调用
- `job_service.py` 管理异步任务状态（pending → processing → done/failed）
- `credit_service.py` 原子积分扣除（乐观锁防并发超扣）
- 文件解锁后积分余额实时更新，无需刷新页面
- `user_unlocked_files.artifact_id` 添加 FK 约束，文件删除时联动清除
- 测试套件：异步重构后 import 路径 + patch 路径全部修正，175 个测试通过

---

### v0.5.0（2026-03-04）

**修复项：**
- 邀请码先验证再消耗，注册失败不吃码
- 积分不足错误统一为 HTTP 402 + 结构化响应 `{detail, balance, required}`
- InsufficientCreditsModal 跳转修正为 `view=resources`
- admin 后台端口 fallback 统一为 8000
- 邀请码统计字段 `used_count` 改为 `use_count`（与 DB 一致）
- ResourceHubTab isOwner 判断从 `user_id` 改为 `uploaded_by`（与 ArtifactOut 一致）
- credits.py admin secret 改用 `admin_secrets_set`（与 admin.py 一致）

---

## 技术栈

### 后端

| 组件 | 版本 / 选型 |
|------|-------------|
| **框架** | FastAPI 0.111+ |
| **运行时** | Python 3.12，Uvicorn |
| **数据库** | Supabase PostgreSQL（托管） |
| **向量存储** | ChromaDB（VPS 本地持久化） |
| **文件存储** | Supabase Storage（签名 URL，10 年有效期） |
| **AI — 问答** | GPT-4o-mini（过滤）+ Gemini 2.0 Flash（生成）+ Imagen 3（配图） |
| **AI — 生成** | GPT-4o（摘要 / 测验 / 闪卡 / 大纲） |
| **AI — 反馈分析** | DeepSeek Chat |
| **Embedding** | OpenAI text-embedding-3-small |
| **PDF 解析** | pypdf |
| **Word 解析** | python-docx |
| **测试** | pytest（175 个测试） |

### 前端

| 组件 | 版本 / 选型 |
|------|-------------|
| **框架** | Next.js 16（App Router） |
| **语言** | TypeScript |
| **样式** | Tailwind CSS v4 |
| **知识图谱** | Cytoscape.js |
| **Markdown** | react-markdown |
| **Auth** | Supabase JS SDK（JWT 本地存储） |
| **图标** | Lucide React |

### 基础设施

| 组件 | 配置 |
|------|------|
| **前端部署** | Vercel（push main 自动 CI/CD） |
| **后端部署** | Hostinger VPS，Ubuntu 22.04，Docker Compose |
| **反向代理** | Nginx（SSL 终止，Let's Encrypt TLS，300s 超时） |
| **域名** | `exammaster.tech`（前端），`api.exammaster.tech`（后端） |
| **数据库托管** | Supabase（PostgreSQL + Auth + Storage） |

---

## 系统架构

```
用户浏览器
    │
    ├── https://exammaster.tech          (Vercel — Next.js)
    │       ├── /login  /register
    │       ├── /dashboard               课程列表
    │       ├── /courses/[id]            主功能页（问答/生成/大纲/图谱/复习）
    │       ├── /mistakes                错题本
    │       └── /admin                   管理后台（X-Admin-Secret 鉴权）
    │
    └── https://api.exammaster.tech      (Hostinger VPS)
            │
            ├── Nginx (80→443 重定向 + SSL + 300s 超时)
            │
            └── FastAPI (Docker, port 8002)
                    ├── Supabase PostgreSQL  ← 元数据 / 用户数据
                    ├── Supabase Storage     ← PDF / Word 文件
                    ├── ChromaDB (VPS 磁盘)  ← 向量索引
                    └── AI APIs              ← OpenAI / Gemini / DeepSeek
```

### RAG 问答四阶段流水线

```
用户问题
  │
  ▼ Stage 1 — 检索
  ChromaDB cosine 相似度 → top-6 chunks
  （中文问题自动双语翻译后双路召回）
  │
  ▼ Stage 2 — 过滤
  GPT-4o-mini：去除与问题无关的 chunks
  │
  ▼ Stage 3 — 生成
  Gemini 2.0 Flash：基于过滤后 chunks 生成带引用的答案
  │
  ▼ Stage 4 — 配图（可选）
  Imagen 3：复杂概念可视化辅助图
```

### 文件处理流水线

```
文件上传（Admin 或用户）
  │
  ▼
Supabase Storage 上传
  path: {course_id}/{sha256[:12]}_{filename}
  │
  ▼ Admin 审批通过后（后台异步任务）
rag_service.process_artifact()
  ├── 1. 从 Storage 下载文件字节
  ├── 2. 提取文本（pypdf / python-docx）
  ├── 3. 清洗（去页码、页眉、乱码）
  ├── 4. 分块（~800 字符，100 字符重叠）
  ├── 5. Embedding（text-embedding-3-small）
  ├── 6. 存入 ChromaDB（向量索引）
  └── 7. 存入 artifact_chunks 表（明文备份）
```

---

## 目录结构

```
UNSW-Exam/
├── backend/                        # FastAPI 后端
│   ├── app/
│   │   ├── main.py                 # 应用入口，CORS，路由注册
│   │   ├── core/
│   │   │   ├── config.py           # 环境变量（pydantic-settings）
│   │   │   ├── dependencies.py     # get_db, get_current_user 依赖注入
│   │   │   ├── exceptions.py       # AppError / AuthError / NotFoundError...
│   │   │   └── supabase_client.py  # Supabase 客户端单例
│   │   ├── models/
│   │   │   ├── auth.py             # RegisterRequest, LoginRequest, TokenResponse
│   │   │   ├── course.py           # CourseOut, ArtifactOut
│   │   │   ├── flashcard.py        # Flashcard, FlashcardDeck
│   │   │   └── generation.py       # GenerateResponse, QuizQuestion
│   │   ├── routers/
│   │   │   ├── auth.py             # /auth/* — 注册/登录/刷新/注销
│   │   │   ├── courses.py          # /courses/* — CRUD
│   │   │   ├── artifacts.py        # /courses/{id}/artifacts — 用户上传
│   │   │   ├── scope_sets.py       # /courses/{id}/scope-sets — 范围集
│   │   │   ├── outputs.py          # /courses/{id}/outputs — 历史输出
│   │   │   ├── content.py          # /courses/{id}/content — chunks 查询
│   │   │   ├── generate.py         # /courses/{id}/generate/* — AI 生成
│   │   │   ├── review.py           # /review/* — 复习计划
│   │   │   ├── knowledge.py        # /knowledge/* — 知识大纲/图谱
│   │   │   ├── feedback.py         # /feedback + /admin/feedback
│   │   │   └── admin.py            # /admin/* — 管理接口
│   │   └── services/
│   │       ├── rag_service.py      # 全链路 RAG（提取/分块/嵌入/检索/清除）
│   │       ├── artifact_service.py # Supabase Storage 上传/下载/删除
│   │       ├── course_service.py   # 课程/artifact 数据库操作
│   │       ├── generate_service.py # AI 生成核心逻辑（run_summary/quiz/outline/flashcards）
│   │       ├── job_service.py      # 异步任务 CRUD（pending → processing → done/failed）
│   │       ├── credit_service.py   # 积分扣除（乐观锁）
│   │       ├── llm_adapter.py      # OpenAI 客户端懒加载封装
│   │       ├── llm_key_service.py  # 动态 API 密钥（DB 优先 + env fallback，60s TTL）
│   │       └── gemini_service.py   # Gemini / Imagen3 调用
│   ├── migrations/                 # 全部数据库 SQL（001~016，按序在 Supabase 执行）
│   ├── tests/                      # pytest 测试（175 个）
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/                       # Next.js 16 前端
│   └── src/
│       ├── app/
│       │   ├── (auth)/             # 路由组：无需登录
│       │   │   ├── login/
│       │   │   └── register/
│       │   ├── (app)/              # 路由组：需要登录
│       │   │   ├── dashboard/      # 课程列表 + 新建课程
│       │   │   ├── courses/[id]/   # 主功能页
│       │   │   └── mistakes/       # 错题本
│       │   ├── admin/              # 管理后台（单页多 Tab）
│       │   └── api/                # Next.js Route Handlers（代理到后端）
│       ├── components/
│       │   ├── course/             # 课程页各功能组件
│       │   ├── flashcard/          # 闪卡组件
│       │   ├── generation/         # 生成结果展示
│       │   ├── KnowledgeTab.tsx    # 知识大纲 + 图谱
│       │   ├── MistakesView.tsx    # 错题本视图
│       │   └── ReviewOutlineTab.tsx # 复习大纲
│       └── lib/
│           ├── api.ts              # 后端 API 调用封装（含错误中文化）
│           ├── types.ts            # 全局 TypeScript 类型定义
│           ├── auth-context.tsx    # 全局认证状态（AuthContext）
│           ├── i18n.tsx            # 中英双语
│           └── mistakes-store.ts   # 错题本本地状态
│
├── nginx/
│   └── nginx.conf                  # HTTP→HTTPS 重定向 + SSL + 反向代理
├── docker-compose.yml              # backend + nginx 编排
└── openapi.json                    # OpenAPI 3.1 规范（自动生成）
```

---

## 数据库设计

所有表均在 Supabase PostgreSQL `public` schema，**RLS 全部禁用**，鉴权由代码层完成。

### 核心表

| 表名 | 主键 | 说明 |
|------|------|------|
| `courses` | UUID | 课程（全局共享，所有用户可见） |
| `artifacts` | BIGSERIAL | 上传文件元数据（file_type, doc_type, status, storage_path） |
| `artifact_chunks` | BIGSERIAL | 文件分块明文（供 fallback 检索） |
| `scope_sets` | BIGSERIAL | 范围集（选择哪些文件参与 AI 生成） |
| `scope_set_items` | 复合 | 范围集 ↔ artifact 多对多关联 |
| `outputs` | BIGSERIAL | AI 生成历史（summary/quiz/outline/flashcards/graph） |
| `flashcards` | UUID | 闪卡（mcq/knowledge 双类型） |
| `mistakes` | BIGSERIAL | 错题本（关联 flashcard_id，wrong_count） |
| `invites` | UUID | 邀请码（code, max_uses, used_count） |
| `api_keys` | UUID | 动态 API 密钥（provider: openai/gemini/deepseek） |
| `review_settings` | UUID | 复习计划配置（review_start_at, exam_at） |
| `review_node_progress` | UUID | 知识点复习进度（done, priority, next_review_at） |
| `knowledge_nodes` | UUID | 知识大纲节点（含 is_ai_generated 标记） |
| `knowledge_edges` | UUID | 知识图谱边（source, target, relation, confidence） |
| `user_feedback` | UUID | 用户反馈（status: pending/in_progress/resolved） |
| `credits` | UUID | 用户积分余额（balance, last_updated） |
| `credit_orders` | UUID | 积分变动记录（amount, reason, balance_after） |
| `user_unlocked_files` | 复合 | 用户已解锁文件（user_id + artifact_id） |
| `generation_jobs` | UUID | 异步生成任务（status, job_type, output_id, error_msg） |

### `artifacts.doc_type` 语义分类

| 值 | 显示名 | RAG 说明 |
|----|--------|----------|
| `lecture` | 讲义 | 默认分类 |
| `tutorial` | 辅导/Lab | — |
| `revision` | 复习总结 | AI 优先引用 |
| `past_exam` | 往年考题 | AI 优先引用 |
| `assignment` | 作业/Project | — |
| `other` | 其他 | — |

---

## API 路由总览

### 认证（`/auth`）

| Method | Path | 说明 |
|--------|------|------|
| POST | `/auth/register` | 注册（需邀请码） |
| POST | `/auth/login` | 登录，返回 JWT |
| POST | `/auth/refresh` | 刷新 access_token |
| POST | `/auth/logout` | 注销 |
| GET | `/auth/me` | 当前用户信息 |

### 课程 & 文件（`/courses`）

| Method | Path | 说明 |
|--------|------|------|
| GET/POST | `/courses` | 列出/新建课程 |
| GET/DELETE | `/courses/{id}` | 获取/删除课程 |
| GET/POST | `/courses/{id}/artifacts` | 列出已批准文件 / 用户上传 |
| DELETE | `/courses/{id}/artifacts/{aid}` | 删除文件 |
| GET/POST | `/courses/{id}/scope-sets` | 范围集管理 |
| GET | `/courses/{id}/outputs` | 历史 AI 生成 |
| GET | `/courses/{id}/content/chunks` | 获取分块原文 |

### AI 生成（`/courses/{id}/generate`）

| Method | Path | 说明 |
|--------|------|------|
| POST | `/generate/summary` | 生成摘要（GPT-4o） |
| POST | `/generate/quiz` | 生成测验（支持 exclude_topics 防重复） |
| POST | `/generate/outline` | 生成学习大纲（GPT-4o） |
| POST | `/generate/flashcards` | 生成闪卡（GPT-4o） |
| POST | `/generate/ask` | 智能问答（4 阶段 RAG） |
| POST | `/generate/translate` | 翻译内容 |
| GET | `/courses/{id}/jobs/{job_id}` | 轮询异步生成任务状态 |

### 知识大纲 & 图谱（`/knowledge`）

| Method | Path | 说明 |
|--------|------|------|
| POST | `/knowledge/build` | 构建大纲 + 图谱（两阶段） |
| GET | `/knowledge/outline` | 获取大纲（`?course_id=`） |
| GET | `/knowledge/graph` | 获取图谱 |
| GET | `/knowledge/node` | 获取单个节点详情 |

### 复习计划（`/review`）

| Method | Path | 说明 |
|--------|------|------|
| GET/POST | `/review/settings` | 复习配置（开始日/考试日） |
| GET/POST | `/review/progress` | 节点学习进度 |
| POST | `/review/today_plan` | 今日推荐复习节点（间隔重复算法） |

### 管理接口（`/admin`，需 Header `X-Admin-Secret`）

| Method | Path | 说明 |
|--------|------|------|
| GET | `/admin/courses` | 列出所有课程 |
| POST | `/admin/courses` | 新建课程 |
| DELETE | `/admin/courses/{id}` | 删除课程 |
| GET | `/admin/artifacts` | 列出所有文件（含 pending） |
| POST | `/admin/artifacts/upload` | Admin 上传文件（直接批准 + 触发 RAG） |
| POST | `/admin/artifacts/url` | Admin 添加 URL 资源 |
| PATCH | `/admin/artifacts/{id}/approve` | 批准文件（触发后台 RAG 处理） |
| PATCH | `/admin/artifacts/{id}/reject` | 拒绝文件（清除 ChromaDB 向量） |
| PATCH | `/admin/artifacts/{id}/doc-type` | 修改文件分类（后台同步 ChromaDB） |
| GET | `/admin/users` | 列出所有用户 |
| GET/POST | `/admin/invites` | 邀请码管理 |
| GET/POST | `/admin/api-keys` | API 密钥管理 |
| PATCH | `/admin/api-keys/{id}/activate` | 激活/停用密钥 |
| DELETE | `/admin/api-keys/{id}` | 删除密钥 |
| GET | `/admin/feedback` | 列出用户反馈 |
| GET | `/admin/feedback/ai-summary` | DeepSeek 分析反馈，输出 PM 报告 |
| PATCH | `/admin/feedback/{id}` | 更新反馈状态 |

### 用户反馈

| Method | Path | 说明 |
|--------|------|------|
| POST | `/feedback` | 提交反馈（需登录） |

---

## 核心功能详解

### 邀请制注册

注册必须提供邀请码（`invites` 表），管理员通过 `/admin/invites` 生成。邀请码支持最大使用次数限制。

### 文件审核工作流

```
用户上传 → status=pending → 等待管理员审批
  ├── 批准 → status=approved → 后台触发 RAG 处理（分块 + 嵌入）
  └── 拒绝 → status=rejected → 清除 ChromaDB 向量 + artifact_chunks 数据
```

Admin 直接上传跳过审批，立即进入 RAG 处理。

### 动态 API 密钥管理

密钥优先级：**DB 激活记录（60s TTL 缓存）> 环境变量 .env**

支持 provider：`openai`、`gemini`、`deepseek`

在 Admin 面板"API 密钥"Tab 中可热更新密钥，无需重启服务。

### 防重复题目生成

测验生成时，前端传入 `exclude_topics`（历史题目主题列表），系统 Prompt 明确要求 LLM 避开已出现的主题，防止用户多次生成时内容重复。

### 知识大纲两阶段构建

- **Stage 1（Grounded）**：完全基于 artifact_chunks 实际文本提炼，`is_ai_generated=false`
- **Stage 2（AI Fill，可选）**：AI 识别知识空白并补全，`is_ai_generated=true`，标注置信度

### 间隔重复复习算法

今日计划（`/review/today_plan`）综合考虑：
- 考试倒计时（剩余天数）
- 节点优先级（high / medium / low）
- 上次复习时间（间隔越长越优先）
- 每日预算时间（分钟数）

---

## 部署说明

### VPS 更新流程

```bash
ssh root@<VPS_IP>
cd /opt/exammaster
git pull
# Dockerfile 或 requirements.txt 有改动时（完整重建）：
docker compose up -d --build backend
# 仅代码改动（不重建镜像）：
docker compose up -d backend
```

常用诊断命令：

```bash
docker compose ps                      # 查看容器健康状态
docker compose logs -f backend         # 实时日志
docker compose logs --tail=50 backend  # 最近 50 行
```

### 前端部署

推送到 `main` 分支后 Vercel 自动构建。关键环境变量：

```
NEXT_PUBLIC_API_URL=https://api.exammaster.tech
```

---

## 本地开发

### 后端

```bash
cd backend
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # 填写各项密钥
uvicorn app.main:app --reload --port 8000
# API 文档：http://localhost:8000/docs
```

### 前端

```bash
cd frontend
npm install
# 创建 frontend/.env.local，填写：
# NEXT_PUBLIC_API_URL=http://localhost:8000
# NEXT_PUBLIC_SUPABASE_URL=...
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...
npm run dev
```

---

## 环境变量

### 后端（`backend/.env`）

| 变量 | 必填 | 说明 |
|------|------|------|
| `SUPABASE_URL` | ✅ | Supabase 项目 URL |
| `SUPABASE_ANON_KEY` | ✅ | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key |
| `OPENAI_API_KEY` | ✅ | OpenAI 密钥（也可 Admin 面板配置） |
| `GEMINI_API_KEY` | — | Google Gemini 密钥（也可 Admin 面板配置） |
| `DEEPSEEK_API_KEY` | — | DeepSeek 密钥（反馈 AI 分析用） |
| `ADMIN_SECRET` | ✅ | Admin 接口鉴权密钥（`X-Admin-Secret` Header） |
| `ADMIN_SECRET_EXTRA` | — | 备用 Admin 密钥（逗号分隔） |
| `APP_ENV` | — | `development` / `production`（影响 CORS） |
| `CORS_ORIGINS` | — | 允许的前端域名（逗号分隔） |
| `SUPABASE_STORAGE_BUCKET` | — | Storage bucket，默认 `artifacts` |

### 前端（`frontend/.env.local`）

| 变量 | 说明 |
|------|------|
| `NEXT_PUBLIC_API_URL` | 后端 API 地址 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |

---

## 数据库迁移

SQL 文件位于 `backend/migrations/`，**在 Supabase SQL Editor 中按序手动执行**：

| 文件 | 内容 |
|------|------|
| `001_schema.sql` | 初始表结构（courses, artifacts, scope_sets, outputs, flashcards, mistakes） |
| `002_indexes_rls.sql` | 索引 + RLS（RLS 实际禁用） |
| `003_artifacts_v2.sql` | artifacts 扩展（status, storage_path, storage_url, file_type） |
| `004_courses_shared.sql` | courses 改为全局共享 |
| `005_artifacts_nullable_user.sql` | artifacts.user_id 改为可空 |
| `006_artifact_chunks.sql` | artifact_chunks 表 |
| `007_invites.sql` | invites 邀请码表 |
| `008_api_keys.sql` | api_keys 动态密钥表 |
| `009_review_plan.sql` | review_settings + review_node_progress |
| `010_artifact_doc_type.sql` | artifacts.doc_type 列 |
| `011_user_feedback.sql` | user_feedback 表 |
| `012_credits.sql` | credits + credit_orders 表 |
| `013_credit_orders.sql` | credit_orders 扩展 |
| `014_unlocked_files.sql` | user_unlocked_files 表 |
| `015_generation_jobs.sql` | generation_jobs 表 |
| `016_fk_unlocked_files.sql` | FK 约束：user_unlocked_files.artifact_id → artifacts.id |

---

## 测试

```bash
cd backend
pytest tests/ -v
# 175 passed
```

| 测试文件 | 覆盖内容 |
|----------|----------|
| `test_routes.py` | FastAPI 路由端到端（健康检查、认证） |
| `test_models.py` | Pydantic 模型验证（Course, Artifact, DocType） |
| `test_generate_utils.py` | LLM 输出 JSON 解析 |
| `test_feedback.py` | 反馈 CRUD（含 Admin 鉴权） |
| `test_doc_type.py` | doc_type 枚举、标签、合法值验证 |
| `test_exceptions.py` | 异常类体系 |
| `test_rag_service.py` | RAG 文本提取/清洗/分块 |
| `test_rag_routing.py` | doc_type 路由（检索时文件过滤） |

---

## Admin 面板

访问 `/admin`，在 UI 中输入 `X-Admin-Secret` 鉴权。

**7 个管理 Tab：**

| Tab | 功能 |
|-----|------|
| 课程管理 | 新建 / 删除课程 |
| 文件管理 | 审批/拒绝上传，修改文件分类，Admin 直接上传 |
| 用户管理 | 查看所有注册用户 |
| 邀请码 | 生成/查看邀请码及使用情况 |
| API 密钥 | 热更新 OpenAI / Gemini / DeepSeek 密钥 |
| 用户反馈 | 查看反馈，更新处理状态 |
| AI 反馈分析 | DeepSeek 生成结构化 PM 报告（Bug / 体验问题 / 新需求 / 行动指南） |

---

*FastAPI · Next.js · Supabase · ChromaDB · GPT-4o · Gemini 2.0 · Imagen 3*
