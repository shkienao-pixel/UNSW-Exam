# UNSW Exam Master — Claude 项目规则

## 项目基本信息

- 前端：Next.js 14 App Router，部署在 Vercel（exammaster.tech）
- 后端：FastAPI，部署在 VPS（api.exammaster.tech），Docker 运行
- 数据库：Supabase PostgreSQL + Auth，RLS 已禁用，代码层手动 user_id 过滤
- VPS SSH：通过 `vps_ssh.py` 脚本操作（见 memory）

## 部署规则

- 改后端代码 → 必须 git push + VPS `docker compose up -d --build backend`
- 改前端代码 → git push 到 main → Vercel 自动部署
- 新增 migration SQL → 必须手动在 Supabase SQL Editor 执行

## 代码规范

- 不要修改没有被要求改动的代码
- 不要添加未被要求的功能、注释、错误处理
- supabase-py v2：`.update().eq()` 不返回数据，必须先 update 再单独 select

---

## AI Execution Harness 架构

### 核心思想

系统已有 RAG、doc_type routing、scope filtering、async jobs、credits、output history 等完整组件。Harness 把"每次 AI 调用"抽象为统一执行单元，所有生成请求（无论同步/异步）都经过相同管道：

```
Request → ContextBuilder → Executor → OutputManager
```

### 文件结构

```
backend/app/harness/
├── types.py                       GenerationRequest / ResolvedContext / GenerationResult
├── protocols.py                   ContextBuilderProtocol / ExecutorProtocol / OutputManagerProtocol
├── harness.py                     GenerationHarness（run_sync / run_async）
├── factory.py                     make_generation_harness(job_type, mode)
├── context_builders/
│   └── default.py                 DefaultContextBuilder（scope + doc_type + RAG）
├── executors/
│   ├── ask.py                     AskExecutor（GPT filter → Gemini → Imagen）
│   └── default.py                 DefaultExecutor（包装 run_summary/quiz/outline/flashcards）
└── output_managers/
    └── default.py                 DefaultOutputManager（幂等扣费 + job 状态更新）
```

### 数据类型

```python
# 所有生成请求的统一入口
@dataclass(frozen=True)
class GenerationRequest:
    user_id: str
    course_id: str
    job_type: str          # "summary"|"quiz"|"outline"|"flashcards"|"ask"|"exam_mock"
    scope_set_id: int | None
    artifact_ids: list[int] | None
    question: str          # ask 专用
    context_mode: str      # ask 专用："all"|"revision"
    history: list[dict]    # ask 专用
    job_id: str | None     # 异步路径注入

# ContextBuilder 的输出
@dataclass
class ResolvedContext:
    artifact_ids: list[int] | None
    text: str              # generate 系列用（chunks 拼接的上下文文本）
    sources: list[dict]    # [{"artifact_id", "file_name", "storage_url"}]
    chunks: list[dict]     # ask 用（原始 RAG chunk 列表）

# Executor 的输出
@dataclass
class GenerationResult:
    content: str
    model_used: str
    sources: list[dict]
    output_id: int | None
    extra: dict            # image_url 等附加字段
```

### 执行流程

**同步路径（/ask）：**
```
POST /ask
  → GenerationRequest(job_type="ask")
  → make_generation_harness("ask", mode="sync")
  → harness.run_sync(db, request)
      → DefaultContextBuilder.build()
          → _resolve_ask_ids()（scope_set / revision / all 三路）
          → search_chunks() → ResolvedContext(chunks=...)
      → AskExecutor.execute()
          → gpt_filter_chunks()
          → gemini_generate_answer() / _chat() fallback
          → [可选] gemini_generate_image()
          → GenerationResult(content, model_used, extra={"image_url"})
      → DefaultOutputManager.persist(mode="sync")
          → credit_service.spend()
```

**异步路径（worker）：**
```
generation_worker._run_job()
  → GenerationRequest(job_type="summary", job_id=...)
  → make_generation_harness("summary", mode="async_job")
  → await harness.run_async(db, request)
      → DefaultContextBuilder.build()
          → _resolve_artifact_ids(priority=["lecture"], fallback=["tutorial"])
          → _get_context_from_chunks() → ResolvedContext(text=...)
      → DefaultExecutor.execute()
          → generate_service.run_summary()
          → GenerationResult(content, output_id)
      → DefaultOutputManager.persist(mode="async_job")
          → 幂等检查 credit_transactions WHERE ref_id=job_id
          → credit_service.spend()
          → job_service.finish_job()
```

### Doc Type Routing 表

定义在 `context_builders/default.py`，新增 job_type 只需加一行：

```python
_DOC_TYPE_ROUTING = {
    "summary":    (["lecture"],   ["tutorial"]),
    "quiz":       (["past_exam"], None),
    "outline":    (["revision"],  None),
    "flashcards": (["lecture"],   ["tutorial"]),
    "exam_mock":  (["past_exam"], None),
    "ask":        (None,          None),   # 由 context_mode 控制
}
```

### 新增生成类型的标准步骤

1. 在 `_DOC_TYPE_ROUTING` 加一行
2. 在 `output_managers/default.py` 的 `_CREDIT_TYPE_MAP` 加一行
3. 在 `executors/default.py` 的 `_GEN_FN` 加一行（如果是调用 generate_service 的新函数）
4. 在 `factory.py` 的 `make_generation_harness` 中确认 executor 分支正确

### 重要边界说明

- **exam_mock** 暂未迁移到 Harness，走 `_run_job_legacy()`（与 exam_service 强耦合）
- **ask/stream** 流式端点不经过 Harness，仍在 `generate.py` 内联实现
- **DefaultExecutor** 是过渡实现：内部调用 `run_*` 函数时会重复构建上下文，待后续将 `run_*` 拆分为纯 LLM 调用部分后消除
- **DefaultOutputManager** 的 async_job 模式含幂等检查，防止 reclaim 重试时二次扣费

### 现有 Services 层（不动）

Harness 只是包装，以下文件不受影响：

| 文件 | 职责 |
|------|------|
| `services/generate_service.py` | run_summary / run_quiz / run_outline / run_flashcards |
| `services/gemini_service.py` | gpt_filter_chunks / gemini_generate_answer / gemini_generate_image |
| `services/rag_service.py` | search_chunks / get_course_chunks / get_artifact_ids_by_doc_type |
| `services/credit_service.py` | spend / earn / credit_guard / COSTS |
| `services/job_service.py` | create_job / claim_job / finish_job / fail_job |
| `services/artifact_service.py` | filter_accessible_artifact_ids / get_all_accessible_artifact_ids |
| `services/course_service.py` | get_scope_set / create_output / list_artifacts |
