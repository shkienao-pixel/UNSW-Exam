# Course Content Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将摘要和复习大纲从"用户触发AI生成"改为"管理员后台生成审核发布 + 用户积分解锁"模式。

**Architecture:** 新建 `course_content` 表存储课程级共享内容（summary/outline），新建 `user_content_unlocks` 表记录解锁，`artifacts.week` 字段支持按周分组生成。后端新增 service + router，前端 Admin 面板加 CourseContentTab，用户端 SummaryTab/OutlineTab 改为带 unlock gate 的展示组件。

**Tech Stack:** FastAPI, Supabase (PostgreSQL + JSONB), OpenAI GPT-4o, Next.js 14, TypeScript

---

## Task 1: DB Migration - artifacts.week + course_content + user_content_unlocks

**Files:**
- Create: `backend/migrations/022_course_content.sql`

**Step 1: 创建 SQL 文件**

```sql
-- 022_course_content.sql

-- 1. artifacts 加 week 字段
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS week INTEGER CHECK (week BETWEEN 1 AND 10);

-- 2. 课程级共享内容表
CREATE TABLE IF NOT EXISTS course_content (
  id           SERIAL PRIMARY KEY,
  course_id    UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('summary', 'outline')),
  content_json JSONB NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'published', 'hidden')),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(course_id, content_type)
);

-- 3. 用户解锁记录表
CREATE TABLE IF NOT EXISTS user_content_unlocks (
  id            SERIAL PRIMARY KEY,
  user_id       UUID NOT NULL,
  course_id     UUID NOT NULL,
  content_type  TEXT NOT NULL CHECK (content_type IN ('summary', 'outline')),
  unlocked_at   TIMESTAMPTZ DEFAULT now(),
  credits_spent INTEGER NOT NULL,
  UNIQUE(user_id, course_id, content_type)
);
```

**Step 2: 在 Supabase SQL Editor 执行**

打开 https://supabase.com/dashboard/project/izmdvtyxqqxbaoblvhec/sql/new，粘贴后 Run。

**Step 3: 验证**

```sql
SELECT column_name FROM information_schema.columns WHERE table_name='artifacts' AND column_name='week';
SELECT table_name FROM information_schema.tables WHERE table_name IN ('course_content','user_content_unlocks');
```

预期：返回 3 行。

**Step 4: 提交**

```bash
git add backend/migrations/022_course_content.sql
git commit -m "feat(content): add course_content + user_content_unlocks tables"
```

---

## Task 2: Backend Service - course_content_service.py

**Files:**
- Create: `backend/app/services/course_content_service.py`

**Step 1: 创建文件**

```python
"""课程级共享内容服务 - summary / outline 的 CRUD 和生成逻辑。"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from supabase import Client

logger = logging.getLogger(__name__)

UNLOCK_COSTS = {"summary": 200, "outline": 300}


# ── CRUD ─────────────────────────────────────────────────────────────────────

def get_content(db: Client, course_id: str, content_type: str) -> dict | None:
    row = (
        db.table("course_content")
        .select("*")
        .eq("course_id", course_id)
        .eq("content_type", content_type)
        .limit(1)
        .execute()
    ).data
    return row[0] if row else None


def upsert_content(
    db: Client,
    course_id: str,
    content_type: str,
    content_json: dict,
    status: str = "draft",
) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    result = (
        db.table("course_content")
        .upsert(
            {
                "course_id": course_id,
                "content_type": content_type,
                "content_json": content_json,
                "status": status,
                "updated_at": now,
            },
            on_conflict="course_id,content_type",
        )
        .select()
        .execute()
    )
    return result.data[0]


def update_status(db: Client, course_id: str, content_type: str, status: str) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    result = (
        db.table("course_content")
        .update({"status": status, "updated_at": now})
        .eq("course_id", course_id)
        .eq("content_type", content_type)
        .select()
        .execute()
    )
    if not result.data:
        raise ValueError(f"course_content not found: {course_id}/{content_type}")
    return result.data[0]


# ── Unlock ────────────────────────────────────────────────────────────────────

def is_unlocked(db: Client, user_id: str, course_id: str, content_type: str) -> bool:
    row = (
        db.table("user_content_unlocks")
        .select("id")
        .eq("user_id", user_id)
        .eq("course_id", course_id)
        .eq("content_type", content_type)
        .limit(1)
        .execute()
    ).data
    return bool(row)


def record_unlock(
    db: Client, user_id: str, course_id: str, content_type: str
) -> dict:
    cost = UNLOCK_COSTS[content_type]
    result = (
        db.table("user_content_unlocks")
        .insert({
            "user_id": user_id,
            "course_id": course_id,
            "content_type": content_type,
            "credits_spent": cost,
        })
        .select()
        .execute()
    )
    return result.data[0]


# ── Generation ────────────────────────────────────────────────────────────────

def _get_week_artifacts(
    db: Client, course_id: str
) -> dict[int, list[dict]]:
    """返回 {week: [artifact, ...]}，只含 lecture 类型且有 week 的已批准 artifacts。"""
    rows = (
        db.table("artifacts")
        .select("id, file_name, file_type, storage_path, week")
        .eq("course_id", course_id)
        .eq("status", "approved")
        .eq("doc_type", "lecture")
        .not_.is_("week", "null")
        .execute()
    ).data or []

    buckets: dict[int, list[dict]] = {}
    for r in rows:
        w = r.get("week")
        if w and 1 <= w <= 10:
            buckets.setdefault(w, []).append(r)
    return buckets


def generate_summary(db: Client, course_id: str) -> dict:
    """按 week 分组生成摘要，存为 draft。"""
    from app.services.artifact_service import download_artifact_bytes
    from app.services.text_extractor import extract_text
    from app.core.config import get_settings
    from openai import OpenAI

    week_map = _get_week_artifacts(db, course_id)
    if not week_map:
        raise ValueError("No lecture artifacts with week assigned found for this course")

    settings = get_settings()
    client = OpenAI(api_key=settings.openai_api_key, timeout=120.0)

    weeks_output = []
    for week_num in sorted(week_map.keys()):
        arts = week_map[week_num]
        # Extract text from all artifacts in this week
        parts = []
        for a in arts:
            sp = a.get("storage_path")
            ft = a.get("file_type", "pdf")
            if not sp or ft == "url":
                continue
            try:
                data = download_artifact_bytes(db, sp)
                text = extract_text(ft, data, a["file_name"])
                parts.append(f"=== {a['file_name']} ===\n{text[:8000]}")
            except Exception as exc:
                logger.warning("Failed to extract week %d artifact %s: %s", week_num, a.get("file_name"), exc)

        if not parts:
            continue

        week_text = "\n\n".join(parts)
        resp = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an academic knowledge extractor. "
                        "Given lecture slides for one week, extract: "
                        "1) a short title for the week (5-10 words), "
                        "2) 5-8 key_points as short phrases, "
                        "3) a detailed markdown summary of the week's content. "
                        "Exclude administrative info (tutor names, dates, grading). "
                        "Respond ONLY as JSON: "
                        '{"title":"...","key_points":["..."],"content":"markdown..."}'
                    ),
                },
                {"role": "user", "content": f"Week {week_num} lecture materials:\n\n{week_text[:12000]}"},
            ],
            temperature=0.3,
            response_format={"type": "json_object"},
        )
        import json
        try:
            parsed = json.loads(resp.choices[0].message.content or "{}")
        except Exception:
            parsed = {"title": f"Week {week_num}", "key_points": [], "content": ""}

        weeks_output.append({
            "week": week_num,
            "title": parsed.get("title", f"Week {week_num}"),
            "key_points": parsed.get("key_points", []),
            "content": parsed.get("content", ""),
        })

    if not weeks_output:
        raise ValueError("No content generated - check that lecture artifacts have text")

    content_json = {"weeks": weeks_output}
    return upsert_content(db, course_id, "summary", content_json, status="draft")


def generate_outline(db: Client, course_id: str) -> dict:
    """从 summary 的 key_points 派生 outline 节点树，存为 draft。"""
    summary = get_content(db, course_id, "summary")
    if not summary:
        raise ValueError("Generate summary first before generating outline")

    weeks_data = summary["content_json"].get("weeks", [])
    weeks_output = []
    for w in weeks_data:
        nodes = []
        for i, kp in enumerate(w.get("key_points", [])):
            nodes.append({
                "id": f"w{w['week']}_n{i}",
                "title": kp,
                "level": 1,
            })
        weeks_output.append({
            "week": w["week"],
            "title": w.get("title", f"Week {w['week']}"),
            "nodes": nodes,
        })

    content_json = {"weeks": weeks_output}
    return upsert_content(db, course_id, "outline", content_json, status="draft")
```

**Step 2: 语法检查**

```bash
python -m py_compile backend/app/services/course_content_service.py
```

**Step 3: 提交**

```bash
git add backend/app/services/course_content_service.py
git commit -m "feat(content): course_content_service with generate/unlock/CRUD"
```

---

## Task 3: Backend Router - course_content.py

**Files:**
- Create: `backend/app/routers/course_content.py`
- Modify: `backend/app/main.py`

**Step 1: 创建 router 文件**

```python
"""Course content routes - admin generation + user unlock/view."""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from supabase import Client

from app.core.dependencies import get_current_user, get_db
from app.core.exceptions import AppError
from app.services import course_content_service as svc
import app.services.credit_service as credit_svc

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Admin auth (reuse same pattern as admin.py) ───────────────────────────────

import hmac
from app.core.config import get_settings

def _require_admin(x_admin_secret: str = Header(default="")) -> None:
    cfg = get_settings()
    if not x_admin_secret or not any(
        hmac.compare_digest(x_admin_secret, s) for s in cfg.admin_secrets_set
    ):
        raise HTTPException(status_code=403, detail="Admin access required")


# ── Admin: get current content ────────────────────────────────────────────────

@router.get("/{course_id}/course-content/{content_type}/admin")
def admin_get_content(
    course_id: str,
    content_type: str,
    _: None = Depends(_require_admin),
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    if content_type not in ("summary", "outline"):
        raise HTTPException(status_code=422, detail="content_type must be summary or outline")
    row = svc.get_content(db, course_id, content_type)
    if not row:
        return {"status": "not_generated", "content_json": {}, "updated_at": None}
    return row


# ── Admin: generate ───────────────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    content_type: str  # 'summary' | 'outline'


@router.post("/{course_id}/course-content/generate")
async def admin_generate_content(
    course_id: str,
    body: GenerateRequest,
    _: None = Depends(_require_admin),
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    if body.content_type not in ("summary", "outline"):
        raise HTTPException(status_code=422, detail="content_type must be summary or outline")

    try:
        if body.content_type == "summary":
            result = await asyncio.to_thread(svc.generate_summary, db, course_id)
        else:
            result = await asyncio.to_thread(svc.generate_outline, db, course_id)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("generate_content failed %s/%s: %s", course_id, body.content_type, exc)
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(exc)[:200]}")


# ── Admin: update content / status ───────────────────────────────────────────

class UpdateContentRequest(BaseModel):
    content_json: dict | None = None
    status: str | None = None  # 'draft' | 'published' | 'hidden'


@router.put("/{course_id}/course-content/{content_type}/admin")
def admin_update_content(
    course_id: str,
    content_type: str,
    body: UpdateContentRequest,
    _: None = Depends(_require_admin),
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    if content_type not in ("summary", "outline"):
        raise HTTPException(status_code=422, detail="content_type must be summary or outline")
    row = svc.get_content(db, course_id, content_type)
    if not row:
        raise HTTPException(status_code=404, detail="Content not found - generate first")

    update: dict[str, Any] = {}
    from datetime import datetime, timezone
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    if body.content_json is not None:
        update["content_json"] = body.content_json
    if body.status is not None:
        if body.status not in ("draft", "published", "hidden"):
            raise HTTPException(status_code=422, detail="Invalid status")
        update["status"] = body.status

    result = (
        db.table("course_content")
        .update(update)
        .eq("course_id", course_id)
        .eq("content_type", content_type)
        .select()
        .execute()
    )
    return result.data[0]


# ── User: status check ────────────────────────────────────────────────────────

@router.get("/{course_id}/course-content/{content_type}/status")
def get_content_status(
    course_id: str,
    content_type: str,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    if content_type not in ("summary", "outline"):
        raise HTTPException(status_code=422, detail="Invalid content_type")

    row = svc.get_content(db, course_id, content_type)
    if not row or row["status"] != "published":
        return {"status": "not_published", "credits_required": svc.UNLOCK_COSTS[content_type]}

    unlocked = svc.is_unlocked(db, current_user["id"], course_id, content_type)
    return {
        "status": "unlocked" if unlocked else "locked",
        "credits_required": svc.UNLOCK_COSTS[content_type],
    }


# ── User: unlock ──────────────────────────────────────────────────────────────

@router.post("/{course_id}/course-content/{content_type}/unlock")
def unlock_content(
    course_id: str,
    content_type: str,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    if content_type not in ("summary", "outline"):
        raise HTTPException(status_code=422, detail="Invalid content_type")

    row = svc.get_content(db, course_id, content_type)
    if not row or row["status"] != "published":
        raise HTTPException(status_code=404, detail="Content not available yet")

    if svc.is_unlocked(db, current_user["id"], course_id, content_type):
        return {"ok": True, "already_unlocked": True}

    cost = svc.UNLOCK_COSTS[content_type]
    credit_svc.spend(db, current_user["id"], cost, f"unlock_{content_type}", course_id)
    svc.record_unlock(db, current_user["id"], course_id, content_type)
    return {"ok": True, "already_unlocked": False, "credits_spent": cost}


# ── User: get content (must be unlocked) ─────────────────────────────────────

@router.get("/{course_id}/course-content/{content_type}")
def get_content_for_user(
    course_id: str,
    content_type: str,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> dict[str, Any]:
    if content_type not in ("summary", "outline"):
        raise HTTPException(status_code=422, detail="Invalid content_type")

    if not svc.is_unlocked(db, current_user["id"], course_id, content_type):
        raise HTTPException(status_code=403, detail="Content not unlocked")

    row = svc.get_content(db, course_id, content_type)
    if not row or row["status"] != "published":
        raise HTTPException(status_code=404, detail="Content not available")

    return row
```

**Step 2: 在 main.py 注册 router（在已有 routers import 行追加）**

在 `backend/app/main.py` 第 13 行 import 列表末尾追加：
```python
from app.routers import course_content
```

在第 46 行附近的 `app.include_router(credits.admin_router...)` 后面追加：
```python
app.include_router(course_content.router, prefix="/courses", tags=["course-content"])
```

**Step 3: 语法检查**

```bash
python -m py_compile backend/app/routers/course_content.py
python -m py_compile backend/app/main.py
```

**Step 4: 提交**

```bash
git add backend/app/routers/course_content.py backend/app/main.py
git commit -m "feat(content): course_content router with admin+user endpoints"
```

---

## Task 4: Admin 面板 - ArtifactsTab 加 week 字段

**Files:**
- Modify: `frontend/src/app/admin/ArtifactsTab.tsx`
- Modify: `frontend/src/app/admin/_shared.tsx`（若 Artifact 类型没有 week 字段需补）

**Step 1: 在 `_shared.tsx` 的 Artifact 类型里加 week 字段**

找到 `interface Artifact` 或 `type Artifact`，加：
```typescript
week?: number | null
```

同时在 `adminReq` 所在的同文件中，确认 PATCH artifact 的路径，现有是 `/admin/artifacts/{id}/doc_type`，week 要走一个新的 PATCH 端点（后端 Task 3 的 admin_update 已支持，但 artifacts.week 需要直接 PATCH artifacts 表）。

实际上，week 字段更新复用现有的 doc_type update 模式，在 admin.py 加一个端点（见下方 Step 2 后的说明），前端调用 `PATCH /admin/artifacts/{id}/week`。

**Step 2: 在 `backend/app/routers/admin.py` 加 week update 端点**

在 `update_artifact_doc_type` 函数后面（约第 155 行之后）追加：

```python
@router.patch("/artifacts/{artifact_id}/week")
def update_artifact_week(
    artifact_id: int,
    week: int | None = Body(embed=True),
    _: None = Depends(_require_admin),
    supabase: Client = Depends(get_db),
) -> dict:
    """Set or clear the week number for a lecture artifact (1-10 or null)."""
    if week is not None and not (1 <= week <= 10):
        raise HTTPException(status_code=422, detail="week must be 1-10 or null")
    result = (
        supabase.table("artifacts")
        .update({"week": week})
        .eq("id", artifact_id)
        .select()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return result.data[0]
```

**Step 3: 在 ArtifactsTab.tsx 的 artifact 行里加 Week 下拉**

在 `doc_type` 下拉（`updateDocType` 调用那一行）旁边，加一个 Week 选择器：

```tsx
// Week selector - show only for lecture artifacts
{a.doc_type === 'lecture' && (
  <select
    value={a.week ?? ''}
    onChange={async e => {
      const val = e.target.value ? Number(e.target.value) : null
      await adminReq(secret, `/admin/artifacts/${a.id}/week`, {
        method: 'PATCH',
        body: JSON.stringify({ week: val }),
      })
      setArtifacts(prev => prev.map(x => x.id === a.id ? { ...x, week: val } : x))
    }}
    className="text-xs rounded px-1 py-0.5 border"
    style={{ background: 'rgba(255,255,255,0.04)', color: '#CCC', borderColor: 'rgba(255,255,255,0.1)' }}
  >
    <option value="">Week -</option>
    {[1,2,3,4,5,6,7,8,9,10].map(w => (
      <option key={w} value={w}>Week {w}</option>
    ))}
  </select>
)}
```

**Step 4: 提交**

```bash
git add frontend/src/app/admin/ArtifactsTab.tsx frontend/src/app/admin/_shared.tsx backend/app/routers/admin.py
git commit -m "feat(content): add week field to artifacts admin UI"
```

---

## Task 5: Admin 面板 - 新建 CourseContentTab

**Files:**
- Create: `frontend/src/app/admin/CourseContentTab.tsx`
- Modify: `frontend/src/app/admin/page.tsx`（加 Tab 入口）

**Step 1: 创建 CourseContentTab.tsx**

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw, CheckCircle, EyeOff, FileText, ListTree } from 'lucide-react'
import { Course, adminReq, Spinner, ErrorBox } from './_shared'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005'

type ContentType = 'summary' | 'outline'
type ContentStatus = 'not_generated' | 'draft' | 'published' | 'hidden'

interface CourseContent {
  id?: number
  status: ContentStatus
  content_json: Record<string, unknown>
  updated_at: string | null
}

const STATUS_LABELS: Record<ContentStatus, string> = {
  not_generated: '未生成',
  draft: '草稿',
  published: '已发布',
  hidden: '已下架',
}
const STATUS_COLORS: Record<ContentStatus, string> = {
  not_generated: '#555',
  draft: '#FFD700',
  published: '#4CAF50',
  hidden: '#FF6666',
}

function ContentCard({
  secret, course, contentType, icon, label, creditCost,
}: {
  secret: string
  course: Course
  contentType: ContentType
  icon: React.ReactNode
  label: string
  creditCost: number
}) {
  const [data, setData] = useState<CourseContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editJson, setEditJson] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminReq(secret, `/courses/${course.id}/course-content/${contentType}/admin`)
      setData(res as CourseContent)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [secret, course.id, contentType])

  useEffect(() => { load() }, [load])

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      await adminReq(secret, `/courses/${course.id}/course-content/generate`, {
        method: 'POST',
        body: JSON.stringify({ content_type: contentType }),
      })
      showToast('生成完成，已保存为草稿')
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  async function changeStatus(status: string) {
    try {
      await adminReq(secret, `/courses/${course.id}/course-content/${contentType}/admin`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      })
      showToast(status === 'published' ? '已发布' : '已更新')
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Update failed')
    }
  }

  async function saveEdit() {
    try {
      const parsed = JSON.parse(editJson)
      await adminReq(secret, `/courses/${course.id}/course-content/${contentType}/admin`, {
        method: 'PUT',
        body: JSON.stringify({ content_json: parsed }),
      })
      setEditing(false)
      showToast('已保存')
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  const status = (data?.status ?? 'not_generated') as ContentStatus

  return (
    <div className="glass rounded-xl p-5" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-semibold text-white">{label}</span>
          <span className="text-xs px-2 py-0.5 rounded"
            style={{ background: `${STATUS_COLORS[status]}18`, color: STATUS_COLORS[status], border: `1px solid ${STATUS_COLORS[status]}40` }}>
            {STATUS_LABELS[status]}
          </span>
          <span className="text-xs" style={{ color: '#555' }}>{creditCost} ✦ 解锁</span>
        </div>
        {loading && <Spinner />}
        {toast && <span className="text-xs" style={{ color: '#4CAF50' }}>{toast}</span>}
      </div>

      {error && <ErrorBox message={error} />}

      {data?.updated_at && (
        <p className="text-xs mb-3" style={{ color: '#555' }}>
          最后更新：{new Date(data.updated_at).toLocaleString('zh-CN')}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={generate} disabled={generating}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{ background: 'rgba(255,215,0,0.12)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.25)' }}>
          {generating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {generating ? '生成中...' : (status === 'not_generated' ? '立即生成' : '重新生成')}
        </button>

        {status !== 'not_generated' && (
          <>
            {status !== 'published' && (
              <button onClick={() => changeStatus('published')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{ background: 'rgba(76,175,80,0.12)', color: '#4CAF50', border: '1px solid rgba(76,175,80,0.25)' }}>
                <CheckCircle size={12} /> 发布
              </button>
            )}
            {status === 'published' && (
              <button onClick={() => changeStatus('hidden')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{ background: 'rgba(255,100,100,0.12)', color: '#FF6666', border: '1px solid rgba(255,100,100,0.25)' }}>
                <EyeOff size={12} /> 下架
              </button>
            )}
            {status === 'hidden' && (
              <button onClick={() => changeStatus('published')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{ background: 'rgba(76,175,80,0.12)', color: '#4CAF50', border: '1px solid rgba(76,175,80,0.25)' }}>
                <CheckCircle size={12} /> 重新发布
              </button>
            )}
            <button
              onClick={() => { setEditing(!editing); setEditJson(JSON.stringify(data?.content_json ?? {}, null, 2)) }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#CCC', border: '1px solid rgba(255,255,255,0.1)' }}>
              {editing ? '取消编辑' : '编辑内容'}
            </button>
          </>
        )}
      </div>

      {editing && (
        <div className="space-y-2">
          <textarea
            value={editJson}
            onChange={e => setEditJson(e.target.value)}
            rows={20}
            className="w-full text-xs rounded-lg p-3 font-mono"
            style={{ background: 'rgba(0,0,0,0.3)', color: '#CCC', border: '1px solid rgba(255,255,255,0.1)', resize: 'vertical' }}
          />
          <button onClick={saveEdit}
            className="px-4 py-1.5 rounded-lg text-sm font-medium"
            style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.3)' }}>
            保存
          </button>
        </div>
      )}
    </div>
  )
}

export function CourseContentTab({ secret }: { secret: string }) {
  const [courses, setCourses] = useState<Course[]>([])
  const [selected, setSelected] = useState<Course | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminReq(secret, '/admin/courses')
      .then((data: unknown) => {
        const list = data as Course[]
        setCourses(list)
        if (list.length > 0) setSelected(list[0])
      })
      .finally(() => setLoading(false))
  }, [secret])

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <select
          value={selected?.id ?? ''}
          onChange={e => setSelected(courses.find(c => c.id === e.target.value) ?? null)}
          className="rounded-lg px-3 py-2 text-sm border"
          style={{ background: 'rgba(255,255,255,0.04)', color: '#CCC', borderColor: 'rgba(255,255,255,0.1)' }}>
          {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {selected && (
        <div className="grid gap-4">
          <ContentCard
            secret={secret} course={selected}
            contentType="summary"
            icon={<FileText size={16} style={{ color: '#FFD700' }} />}
            label="知识摘要"
            creditCost={200}
          />
          <ContentCard
            secret={secret} course={selected}
            contentType="outline"
            icon={<ListTree size={16} style={{ color: '#A78BFA' }} />}
            label="复习大纲"
            creditCost={300}
          />
        </div>
      )}
    </div>
  )
}
```

**Step 2: 在 `frontend/src/app/admin/page.tsx` 的 getTabs() 加新 Tab**

找到现有 `getTabs()` 函数，在末尾追加一个 Tab：

```tsx
{
  key: 'course-content',
  label: lang === 'zh' ? '课程内容' : 'Content',
  component: <CourseContentTab secret={adminSecret} />,
}
```

同时在文件顶部 import 中加：
```tsx
import { CourseContentTab } from './CourseContentTab'
```

**Step 3: 提交**

```bash
git add frontend/src/app/admin/CourseContentTab.tsx frontend/src/app/admin/page.tsx
git commit -m "feat(admin): add CourseContentTab for summary/outline management"
```

---

## Task 6: Frontend api.ts - 新增 courseContent API

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/types.ts`（如需添加类型）

**Step 1: 在 types.ts 加 CourseContentStatus 类型**

```typescript
export type CourseContentStatus = 'not_published' | 'locked' | 'unlocked'

export interface CourseContentWeek {
  week: number
  title: string
  key_points: string[]
  content: string
}

export interface CourseContentSummary {
  weeks: CourseContentWeek[]
}

export interface CourseContentOutlineNode {
  id: string
  title: string
  level: number
}

export interface CourseContentOutlineWeek {
  week: number
  title: string
  nodes: CourseContentOutlineNode[]
}

export interface CourseContentOutline {
  weeks: CourseContentOutlineWeek[]
}
```

**Step 2: 在 api.ts 加 courseContent 命名空间**

在文件末尾的 `export const api = { ... }` 对象里追加：

```typescript
courseContent: {
  status: (courseId: string, contentType: 'summary' | 'outline') =>
    req<{ status: CourseContentStatus; credits_required: number }>(
      `/courses/${courseId}/course-content/${contentType}/status`
    ),
  unlock: (courseId: string, contentType: 'summary' | 'outline') =>
    req<{ ok: boolean; already_unlocked: boolean; credits_spent?: number }>(
      `/courses/${courseId}/course-content/${contentType}/unlock`,
      { method: 'POST' }
    ),
  get: (courseId: string, contentType: 'summary' | 'outline') =>
    req<{ content_json: Record<string, unknown> }>(
      `/courses/${courseId}/course-content/${contentType}`
    ),
},
```

**Step 3: 提交**

```bash
git add frontend/src/lib/api.ts frontend/src/lib/types.ts
git commit -m "feat(content): add courseContent API methods and types"
```

---

## Task 7: 用户端 - SummaryTab 重构

**Files:**
- Modify: `frontend/src/app/(app)/courses/[id]/page.tsx`（SummaryTab 函数，约第 392-403 行）

**Step 1: 将 SummaryTab 替换为新实现**

找到 `function SummaryTab({ courseId }: { courseId: string })` 并整体替换为：

```tsx
function SummaryTab({ courseId }: { courseId: string }) {
  const { t } = useLang()
  const [status, setStatus] = useState<'loading' | 'not_published' | 'locked' | 'unlocked'>('loading')
  const [creditsRequired, setCreditsRequired] = useState(200)
  const [weeks, setWeeks] = useState<{ week: number; title: string; key_points: string[]; content: string }[]>([])
  const [expanded, setExpanded] = useState<Set<number>>(new Set([1]))
  const [unlocking, setUnlocking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.courseContent.status(courseId, 'summary').then(res => {
      setStatus(res.status)
      setCreditsRequired(res.credits_required)
      if (res.status === 'unlocked') loadContent()
    }).catch(() => setStatus('not_published'))
  }, [courseId])

  async function loadContent() {
    try {
      const res = await api.courseContent.get(courseId, 'summary')
      const json = res.content_json as { weeks?: typeof weeks }
      setWeeks(json.weeks ?? [])
    } catch { setError('加载失败，请刷新重试') }
  }

  async function handleUnlock() {
    setUnlocking(true)
    setError(null)
    try {
      await api.courseContent.unlock(courseId, 'summary')
      setStatus('unlocked')
      await loadContent()
    } catch (e: unknown) {
      const err = e as { code?: string; balance?: number; required?: number }
      if (err.code === 'INSUFFICIENT_CREDITS') {
        setError(`积分不足（当前 ${err.balance}✦，需要 ${err.required}✦）`)
      } else {
        setError(e instanceof Error ? e.message : '解锁失败')
      }
    } finally { setUnlocking(false) }
  }

  if (status === 'loading') return (
    <div className="flex justify-center py-20">
      <Loader2 className="animate-spin" size={24} style={{ color: '#FFD700' }} />
    </div>
  )

  if (status === 'not_published') return (
    <div className="text-center py-20 glass rounded-2xl" style={{ color: '#444' }}>
      <FileText size={52} className="mx-auto mb-4 opacity-20" />
      <p className="text-base font-medium text-white mb-2">摘要准备中</p>
      <p className="text-sm" style={{ color: '#555' }}>管理员正在整理课程内容，敬请期待</p>
    </div>
  )

  if (status === 'locked') return (
    <div className="text-center py-20 glass rounded-2xl space-y-4" style={{ color: '#444' }}>
      <FileText size={52} className="mx-auto opacity-30" />
      <p className="text-xl font-bold text-white">知识摘要</p>
      <p className="text-sm" style={{ color: '#777' }}>按 Week 整理的核心知识点与内容精华</p>
      {error && <p className="text-sm" style={{ color: '#FF6666' }}>{error}</p>}
      <button
        onClick={handleUnlock} disabled={unlocking}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
        style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.35)' }}>
        {unlocking ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
        {unlocking ? '解锁中...' : `解锁摘要 ${creditsRequired} ✦`}
      </button>
      <p className="text-xs" style={{ color: '#444' }}>一次解锁，永久可用</p>
    </div>
  )

  // Unlocked
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <FileText size={20} style={{ color: '#FFD700' }} />
        <h2 className="text-2xl font-bold text-white">知识摘要</h2>
      </div>
      {error && <p className="text-sm" style={{ color: '#FF6666' }}>{error}</p>}
      {weeks.map(w => {
        const open = expanded.has(w.week)
        return (
          <div key={w.week} className="glass rounded-xl overflow-hidden"
            style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
            <button
              className="w-full flex items-center justify-between px-5 py-4 text-left"
              onClick={() => setExpanded(prev => {
                const next = new Set(prev)
                open ? next.delete(w.week) : next.add(w.week)
                return next
              })}>
              <div className="flex items-center gap-3">
                <span className="text-xs px-2 py-0.5 rounded font-mono font-bold"
                  style={{ background: 'rgba(255,215,0,0.12)', color: '#FFD700' }}>
                  W{w.week}
                </span>
                <span className="font-semibold text-white">{w.title}</span>
              </div>
              {open
                ? <ChevronDown size={16} style={{ color: '#555' }} />
                : <ChevronRight size={16} style={{ color: '#555' }} />}
            </button>
            {open && (
              <div className="px-5 pb-5 space-y-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                {w.key_points.length > 0 && (
                  <div className="pt-3">
                    <p className="text-xs font-semibold mb-2" style={{ color: '#888' }}>核心知识点</p>
                    <ul className="space-y-1">
                      {w.key_points.map((kp, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm" style={{ color: '#CCC' }}>
                          <span style={{ color: '#FFD700', marginTop: 2 }}>•</span> {kp}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {w.content && (
                  <ContentTranslationPanel content={w.content} courseId={courseId} />
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

注意：需要在文件顶部 import 里确认 `ChevronDown`、`ChevronRight`、`Zap` 已引入（`lucide-react`）。

**Step 2: 提交**

```bash
git add frontend/src/app/(app)/courses/[id]/page.tsx
git commit -m "feat(content): SummaryTab rewritten with unlock gate + weekly accordion"
```

---

## Task 8: 用户端 - OutlineTab（复习大纲）重构

**Files:**
- Modify: `frontend/src/components/ReviewOutlineTab.tsx`

**Step 1: 修改 ReviewOutlineTab 的数据来源**

在 `ReviewOutlineTab` 主组件中，把原来的：
```typescript
api.outputs.list(courseId, 'outline').then(outs => {
  if (outs.length > 0 && outs[0].content) {
    setRoots(parseOutlineMarkdown(outs[0].content))
  }
})
```

替换为：

```typescript
// 先查解锁状态
api.courseContent.status(courseId, 'outline').then(res => {
  setUnlockStatus(res.status)
  setCreditsRequired(res.credits_required)
  if (res.status === 'unlocked') {
    return api.courseContent.get(courseId, 'outline').then(data => {
      const json = data.content_json as { weeks?: { week: number; title: string; nodes: { id: string; title: string; level: number }[] }[] }
      const nodes = buildNodesFromContentJson(json)
      setRoots(nodes)
    })
  }
}).catch(() => setUnlockStatus('not_published'))
  .finally(() => setOutlineLoading(false))
```

新增 state：
```typescript
const [unlockStatus, setUnlockStatus] = useState<'loading' | 'not_published' | 'locked' | 'unlocked'>('loading')
const [creditsRequired, setCreditsRequired] = useState(300)
const [unlocking, setUnlocking] = useState(false)
```

新增 helper：
```typescript
function buildNodesFromContentJson(json: {
  weeks?: { week: number; title: string; nodes: { id: string; title: string; level: number }[] }[]
}): OutlineNodeData[] {
  const roots: OutlineNodeData[] = []
  for (const w of json.weeks ?? []) {
    const weekNode: OutlineNodeData = {
      id: `week_${w.week}`,
      title: `Week ${w.week}: ${w.title}`,
      level: 1,
      parent_id: null,
      children: w.nodes.map(n => ({
        id: n.id,
        title: n.title,
        level: 2,
        parent_id: `week_${w.week}`,
        children: [],
      })),
    }
    roots.push(weekNode)
  }
  return roots
}
```

新增解锁处理函数：
```typescript
async function handleUnlock() {
  setUnlocking(true)
  try {
    await api.courseContent.unlock(courseId, 'outline')
    setUnlockStatus('unlocked')
    // reload outline nodes
    const data = await api.courseContent.get(courseId, 'outline')
    const json = data.content_json as Parameters<typeof buildNodesFromContentJson>[0]
    setRoots(buildNodesFromContentJson(json))
  } catch (e: unknown) {
    console.error(e)
  } finally {
    setUnlocking(false)
  }
}
```

**Step 2: 在 loading 之前/之后加 gate 渲染**

在 `if (outlineLoading || reviewLoading)` 之前加：

```tsx
if (unlockStatus === 'not_published') return (
  <div className="text-center py-20 glass rounded-2xl">
    <ListTree size={52} className="mx-auto mb-4 opacity-20" style={{ color: '#A78BFA' }} />
    <p className="text-base font-medium text-white mb-2">复习大纲准备中</p>
    <p className="text-sm" style={{ color: '#555' }}>管理员正在整理，敬请期待</p>
  </div>
)

if (unlockStatus === 'locked') return (
  <div className="text-center py-20 glass rounded-2xl space-y-4">
    <ListTree size={52} className="mx-auto opacity-30" style={{ color: '#A78BFA' }} />
    <p className="text-xl font-bold text-white">复习大纲</p>
    <p className="text-sm" style={{ color: '#777' }}>按 Week 拆分的复习节点，支持打勾进度与考试规划</p>
    <button
      onClick={handleUnlock} disabled={unlocking}
      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm"
      style={{ background: 'rgba(167,139,250,0.15)', color: '#A78BFA', border: '1px solid rgba(167,139,250,0.3)' }}>
      {unlocking ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
      {unlocking ? '解锁中...' : `解锁复习大纲 ${creditsRequired} ✦`}
    </button>
    <p className="text-xs" style={{ color: '#444' }}>一次解锁，永久可用</p>
  </div>
)
```

**Step 3: 提交**

```bash
git add frontend/src/components/ReviewOutlineTab.tsx
git commit -m "feat(content): OutlineTab uses course_content with unlock gate"
```

---

## Task 9: 生成面板 - 移除 summary / outline 选项

**Files:**
- Modify: `frontend/src/app/(app)/courses/[id]/page.tsx`（GeneratePanel 组件，约第 1143-1340 行）

**Step 1: 找到生成面板的 genTypes 数组**

约第 1174-1177 行，找到：
```tsx
{ key: 'summary' as GenType, ... },
...
{ key: 'outline' as GenType, ... },
```

删除这两项。同时更新 `GenType` 类型定义（约第 1143 行）：
```typescript
type GenType = 'quiz' | 'flashcards'
```

并检查 `genType` 默认值（约第 1157 行），改为：
```typescript
const [genType, setGenType] = useState<GenType>('quiz')
```

以及积分显示逻辑中涉及 `outline` 和 `summary` 的分支一并删除。

**Step 2: 提交**

```bash
git add frontend/src/app/(app)/courses/[id]/page.tsx
git commit -m "feat(content): remove summary/outline from user generate panel"
```

---

## Task 10: 部署到 VPS

**Step 1: 推送代码**

```bash
git push origin main
```

**Step 2: VPS 重建**

```bash
/d/pppppppp/python.exe C:/Users/Administrator/Desktop/UNSWExam/vps_ssh.py "cd /opt/exammaster && git pull && docker compose up -d --build backend"
```

**Step 3: 查看日志**

```bash
/d/pppppppp/python.exe C:/Users/Administrator/Desktop/UNSWExam/vps_ssh.py "cd /opt/exammaster && docker compose logs --tail=30 backend"
```

预期：`Uvicorn running on`，无 ImportError。

**Step 4: 冒烟测试**

1. Admin 面板 → 某课程 → ArtifactsTab：检查 lecture artifact 能设置 Week 1-10
2. Admin 面板 → CourseContentTab：选课程 → 点"立即生成"摘要 → 等待 → 出现草稿 → 点"发布"
3. Admin 面板 → CourseContentTab：点"立即生成"大纲 → 发布
4. 用户端 → 进入课程 → 摘要 Tab：显示"解锁 200✦"按钮 → 点击 → 展示 Week1-10 Accordion
5. 用户端 → 大纲 Tab：显示"解锁 300✦"按钮 → 点击 → 展示复习大纲 + 进度追踪

---

## 执行顺序说明

Tasks 1（DB Migration）需要用户手动在 Supabase 执行 SQL。
Tasks 2-3（后端）可以串行执行。
Tasks 4-9（前端）可以在后端完成后串行执行。
Task 10（部署）最后执行。
