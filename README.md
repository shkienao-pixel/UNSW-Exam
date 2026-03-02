# Exam Master ✦

**[English](#exam-master--1) | [中文](#exam-master--中文)**

---

<a id="exam-master--1"></a>

# Exam Master ✦ — English

AI-powered exam preparation platform for university students. Upload course PDFs and instantly get AI-generated flashcards, quizzes, summaries, outlines, and intelligent Q&A — all scoped to your chosen syllabus range.

**Live:** https://exammaster.tech

## Features

| Feature | Description |
|---|---|
| **Flashcards** | AI-generated spaced-repetition cards with mistake tracking |
| **Mistake Set** | Review and retry all previously wrong answers |
| **Quiz** | AI-generated MCQ with instant feedback and explanations |
| **Summary** | Bilingual course summary (EN + ZH) |
| **Outline** | Scoped syllabus checklist |
| **AI Q&A** | Multi-modal: text questions + image upload for visual explanations |
| **AI Generate** | One-click batch generation of all study materials |
| **File Upload** | PDF ingestion and vector indexing pipeline |
| **Scope Sets** | Pinpoint which artifacts to include in AI context |

### AI Q&A — Multi-modal RAG Pipeline

```
User Question
    │
    ├─ [Has image?] ──Yes──→ Gemini 2.5 Pro VQA (visual understanding)
    │
    └─ [Text only] ──────→ pgvector retrieval
                               │
                           GPT-4o filter (relevance scoring)
                               │
                           Gemini 2.5 Pro answer generation
                               │
                       [Click "Generate Diagram"] → Imagen 4 Ultra
```

## Tech Stack

### Frontend
| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Auth | Supabase Auth (JWT) |
| Deployment | Vercel |

### Backend
| Layer | Technology |
|---|---|
| Framework | FastAPI (Python 3.11+) |
| Database | Supabase PostgreSQL |
| Vector Store | pgvector (1536-dim, cosine distance) |
| File Storage | Supabase Storage |
| Deployment | Docker · Nginx · Hostinger VPS |

### AI Models
| Stage | Model |
|---|---|
| Text Q&A + VQA | Gemini 2.5 Pro |
| Context Filter | GPT-4o |
| Diagram Generation | Imagen 4 Ultra |
| Embeddings | text-embedding-3-small |

## Architecture

```
Browser
  │
  └─ Next.js (Vercel)
       ├─ /app/(app)/...       ← UI pages (dashboard, courses, admin)
       └─ /app/api/...         ← TypeScript API routes (proxy + Gemini SDK)
              │
              ├─ Supabase Auth  ← JWT verification
              └─ FastAPI (VPS)  ← RAG pipeline, PDF processing, vector search
                     │
                     └─ Supabase PostgreSQL + pgvector
```

## Project Structure

```
UNSWExam/
├── frontend/                  # Next.js 14 app
│   ├── src/
│   │   ├── app/
│   │   │   ├── (app)/         # Authenticated pages
│   │   │   │   ├── dashboard/ # Course list
│   │   │   │   ├── courses/   # Per-course study views
│   │   │   │   └── layout.tsx # Sidebar + auth guard
│   │   │   ├── api/           # TypeScript API routes
│   │   │   │   ├── generate/  # ask, flashcards, quiz, summary, outline
│   │   │   │   └── explain-with-image/  # Imagen 4 Ultra endpoint
│   │   │   ├── admin/         # Admin dashboard
│   │   │   └── login/         # Auth page
│   │   └── lib/
│   │       ├── api.ts         # Typed API client
│   │       ├── auth-context.tsx
│   │       ├── types.ts
│   │       └── i18n.tsx       # EN/ZH toggle
│   └── package.json
│
├── backend/                   # FastAPI app
│   ├── app/
│   │   ├── main.py            # App entry, CORS, middleware
│   │   ├── core/config.py     # Settings (Pydantic)
│   │   ├── routers/
│   │   │   ├── auth.py        # Register (invite-only), login
│   │   │   ├── courses.py     # Course CRUD
│   │   │   ├── artifacts.py   # PDF upload + embedding
│   │   │   ├── generate.py    # Flashcards, quiz, summary, ask, translate
│   │   │   ├── scope_sets.py  # Scope set management
│   │   │   └── admin.py       # User/invite/API key management
│   │   └── services/
│   │       ├── gemini_service.py   # GPT-4o filter + Gemini answer + Imagen
│   │       └── llm_key_service.py  # Dynamic API key (DB-first + env fallback)
│   ├── migrations/            # SQL migration files (001–008)
│   └── requirements.txt
│
├── docker-compose.yml
├── nginx.conf
└── README.md
```

## Quick Start (Local Development)

### Prerequisites
- Node.js 18+
- Python 3.11+
- Supabase project (with pgvector extension enabled)

### Backend

```bash
cd backend
pip install -r requirements.txt

# Create .env
cp .env.example .env
# Fill in: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET,
#           OPENAI_API_KEY, GEMINI_API_KEY, ADMIN_SECRET

uvicorn app.main:app --reload --port 8005
```

### Frontend

```bash
cd frontend
npm install

# Create .env.local
cp .env.local.example .env.local
# Fill in: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
#           NEXT_PUBLIC_API_URL (→ http://localhost:8005),
#           GEMINI_API_KEY

npm run dev
```

Open http://localhost:3000

## Deployment

### Backend (Docker + VPS)

```bash
cd /opt/exammaster
git pull
docker compose up -d --build backend

# View logs
docker compose logs -f backend
```

### Frontend (Vercel)

Connect the GitHub repo to Vercel, set environment variables in the Vercel dashboard, and deploy automatically on every push.

## Admin Panel

Access at `/admin`. Requires `ADMIN_SECRET` environment variable.

Features:
- **Users** — view registered users
- **Courses** — create / delete courses
- **Invites** — generate invite codes for registration
- **Files** — manage uploaded PDFs per course
- **API Keys** — manage LLM API keys (stored in DB, 60s TTL cache)

## Database Migrations

Migrations run automatically on backend startup.

```
migrations/
├── 001_schema.sql        # Core tables
├── 002_indexes_rls.sql   # Indexes
├── 003_artifacts.sql     # Artifact storage
├── 004_scope_sets.sql    # Scope sets
├── 005_outputs.sql       # Generated outputs cache
├── 006_flashcards.sql    # Flashcard tables
├── 007_invites.sql       # Invite code system
└── 008_api_keys.sql      # API key management
```

## Environment Variables

### Backend (`.env`)

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `JWT_SECRET` | JWT signing secret |
| `OPENAI_API_KEY` | OpenAI API key (GPT-4o + embeddings) |
| `GEMINI_API_KEY` | Google Gemini API key |
| `ADMIN_SECRET` | Admin panel access secret |

### Frontend (`.env.local`)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `NEXT_PUBLIC_API_URL` | Backend URL |
| `GEMINI_API_KEY` | Google Gemini API key (server-side routes) |

## Registration

Registration is **invite-only**. Admins generate invite codes via the admin panel (`/admin → Invites`). Each code has a configurable usage limit.

## License

MIT

---

<a id="exam-master--中文"></a>

# Exam Master ✦ — 中文

面向大学生的 AI 驱动考试备考平台。上传课程 PDF，即可自动生成闪卡、模拟题、摘要、大纲和智能问答——所有内容均可限定在你选择的大纲范围内。

**线上地址：** https://exammaster.tech

## 功能特性

| 功能 | 描述 |
|---|---|
| **闪卡** | AI 生成的间隔重复闪卡，支持错题追踪 |
| **错题集** | 复习并重做所有历史错题 |
| **模拟题** | AI 生成 MCQ 选择题，即时反馈与解析 |
| **摘要** | 中英双语课程摘要 |
| **大纲** | 按范围过滤的教学大纲清单 |
| **AI 问答** | 多模态：文字提问 + 图片上传，支持视觉理解 |
| **AI 生成** | 一键批量生成所有学习材料 |
| **文件上传** | PDF 解析与向量索引流水线 |
| **Scope Sets** | 精确控制 AI 上下文中包含的文件范围 |

### AI 问答——多模型 RAG 流水线

```
用户提问
    │
    ├─ [携带图片？] ──是──→ Gemini 2.5 Pro VQA（视觉理解）
    │
    └─ [纯文字] ────────→ pgvector 向量检索
                               │
                           GPT-4o 相关性过滤
                               │
                           Gemini 2.5 Pro 生成答案
                               │
                   [点击"生成讲解图"] → Imagen 4 Ultra
```

## 技术栈

### 前端
| 层级 | 技术 |
|---|---|
| 框架 | Next.js 14（App Router） |
| 语言 | TypeScript |
| 样式 | Tailwind CSS |
| 认证 | Supabase Auth（JWT） |
| 部署 | Vercel |

### 后端
| 层级 | 技术 |
|---|---|
| 框架 | FastAPI（Python 3.11+） |
| 数据库 | Supabase PostgreSQL |
| 向量库 | pgvector（1536 维，余弦距离） |
| 文件存储 | Supabase Storage |
| 部署 | Docker · Nginx · Hostinger VPS |

### AI 模型
| 阶段 | 模型 |
|---|---|
| 文字问答 + 视觉问答 | Gemini 2.5 Pro |
| 上下文过滤 | GPT-4o |
| 教学图生成 | Imagen 4 Ultra |
| 向量嵌入 | text-embedding-3-small |

## 系统架构

```
浏览器
  │
  └─ Next.js（Vercel）
       ├─ /app/(app)/...       ← UI 页面（仪表板、课程、管理后台）
       └─ /app/api/...         ← TypeScript API 路由（代理 + Gemini SDK）
              │
              ├─ Supabase Auth  ← JWT 鉴权
              └─ FastAPI（VPS） ← RAG 流水线、PDF 处理、向量搜索
                     │
                     └─ Supabase PostgreSQL + pgvector
```

## 本地开发快速启动

### 前置条件
- Node.js 18+
- Python 3.11+
- Supabase 项目（需开启 pgvector 扩展）

### 启动后端

```bash
cd backend
pip install -r requirements.txt

# 创建 .env
cp .env.example .env
# 填写：SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY、JWT_SECRET、
#        OPENAI_API_KEY、GEMINI_API_KEY、ADMIN_SECRET

uvicorn app.main:app --reload --port 8005
```

### 启动前端

```bash
cd frontend
npm install

# 创建 .env.local
cp .env.local.example .env.local
# 填写：NEXT_PUBLIC_SUPABASE_URL、NEXT_PUBLIC_SUPABASE_ANON_KEY、
#        NEXT_PUBLIC_API_URL（→ http://localhost:8005）、
#        GEMINI_API_KEY

npm run dev
```

打开 http://localhost:3000

## 生产部署

### 后端（Docker + VPS）

```bash
cd /opt/exammaster
git pull
docker compose up -d --build backend

# 查看日志
docker compose logs -f backend
```

### 前端（Vercel）

将 GitHub 仓库连接到 Vercel，在 Vercel 控制台配置环境变量，每次推送代码后自动部署。

## 管理后台

访问地址：`/admin`，需配置 `ADMIN_SECRET` 环境变量。

功能：
- **用户管理** — 查看已注册用户
- **课程管理** — 创建 / 删除课程
- **邀请码** — 生成注册邀请码
- **文件管理** — 管理各课程的 PDF 文件
- **API 密钥** — 管理 LLM API 密钥（存储于数据库，60 秒 TTL 缓存）

## 数据库迁移

后端启动时自动执行迁移。

```
migrations/
├── 001_schema.sql        # 核心表结构
├── 002_indexes_rls.sql   # 索引
├── 003_artifacts.sql     # 文件存储
├── 004_scope_sets.sql    # Scope Sets
├── 005_outputs.sql       # 生成内容缓存
├── 006_flashcards.sql    # 闪卡表
├── 007_invites.sql       # 邀请码系统
└── 008_api_keys.sql      # API 密钥管理
```

## 环境变量

### 后端（`.env`）

| 变量名 | 说明 |
|---|---|
| `SUPABASE_URL` | Supabase 项目地址 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role 密钥 |
| `JWT_SECRET` | JWT 签名密钥 |
| `OPENAI_API_KEY` | OpenAI API 密钥（GPT-4o + 向量嵌入） |
| `GEMINI_API_KEY` | Google Gemini API 密钥 |
| `ADMIN_SECRET` | 管理后台访问密钥 |

### 前端（`.env.local`）

| 变量名 | 说明 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目地址 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名密钥 |
| `NEXT_PUBLIC_API_URL` | 后端地址 |
| `GEMINI_API_KEY` | Google Gemini API 密钥（服务端路由使用） |

## 注册方式

注册为**邀请制**。管理员在后台（`/admin → 邀请码`）生成邀请码，每个邀请码可设置最大使用次数。

## 开源协议

MIT
