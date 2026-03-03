# UNSW Exam Master

> 面向海外留学生的 AI 驱动考试复习平台。上传课程资料，AI 自动生成摘要、测验、闪卡、知识图谱，并提供智能问答。

**生产地址：** https://exammaster.tech

---

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
│   │       ├── llm_adapter.py      # OpenAI 客户端懒加载封装
│   │       ├── llm_key_service.py  # 动态 API 密钥（DB 优先 + env fallback，60s TTL）
│   │       └── gemini_service.py   # Gemini / Imagen3 调用
│   ├── migrations/                 # 全部数据库 SQL（001~011，按序在 Supabase 执行）
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
│       │   │   ├── courses/[id]/   # 主功能页（问答/生成/大纲/图谱/复习）
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
| GET/POST | `/courses/{id}/artifacts` | 列出已批准文件 / 用户上传（status=pending） |
| DELETE | `/courses/{id}/artifacts/{aid}` | 删除文件 |
| GET/POST | `/courses/{id}/scope-sets` | 范围集管理 |
| GET | `/courses/{id}/outputs` | 历史 AI 生成 |
| GET | `/courses/{id}/content/chunks` | 获取分块原文 |

### AI 生成（`/courses/{id}/generate`）

| Method | Path | 说明 |
|--------|------|------|
| POST | `/generate/summary` | 生成摘要（GPT-4o） |
| POST | `/generate/quiz` | 生成测验（GPT-4o，支持 exclude_topics 防重复） |
| POST | `/generate/outline` | 生成学习大纲（GPT-4o） |
| POST | `/generate/flashcards` | 生成闪卡（GPT-4o） |
| POST | `/generate/ask` | 智能问答（4 阶段 RAG 流水线） |
| POST | `/generate/translate` | 翻译内容 |

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
ssh root@76.13.216.86
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
```

API 文档访问：http://localhost:8000/docs

### 前端

```bash
cd frontend
npm install
# 创建 .env.local，填写：
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
