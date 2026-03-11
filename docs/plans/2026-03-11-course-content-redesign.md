# 课程内容重构设计文档（摘要 + 复习大纲）

**Date:** 2026-03-11
**Status:** Approved

## Goal

将摘要（Summary）和复习大纲（Outline）从"用户触发 AI 生成"模式改为"管理员后台生成 → 审核发布 → 用户积分解锁"模式。

## Background

原有问题：
- 摘要/大纲每个用户各生成一份，内容质量参差不齐，消耗积分高
- 无法保证内容质量，管理员无法审核
- 大纲结构不稳定，review_node_progress 进度会因重新生成而失效

新模式：
- 管理员后台触发生成 → 每门课一份共用内容 → 审核后发布
- 用户花固定积分一次性解锁（摘要 200✦，复习大纲 300✦）
- 复习大纲节点结构稳定，用户进度不会丢失

---

## Part 1：数据模型

### artifacts 表新增字段

```sql
ALTER TABLE artifacts ADD COLUMN week INTEGER CHECK (week BETWEEN 1 AND 10);
```

管理员审核 artifact 时可指定所属 week（1-10），NULL 表示不分周。
生成摘要时按 week 分组处理，没有对应 week 的不展示。

### course_content 表（新建）

```sql
CREATE TABLE course_content (
  id           SERIAL PRIMARY KEY,
  course_id    UUID NOT NULL REFERENCES courses(id),
  content_type TEXT NOT NULL CHECK (content_type IN ('summary', 'outline')),
  content_json JSONB NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'published', 'hidden')),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(course_id, content_type)
);
```

状态流转：`draft`（刚生成）→ `published`（管理员发布）→ `hidden`（下架）

#### content_json 结构 — summary

```json
{
  "weeks": [
    {
      "week": 1,
      "title": "Introduction to the Course",
      "key_points": ["概念A", "概念B", "概念C"],
      "content": "## Week 1\n\n核心内容 markdown..."
    }
  ]
}
```

#### content_json 结构 — outline

```json
{
  "weeks": [
    {
      "week": 1,
      "title": "Introduction",
      "nodes": [
        { "id": "w1_n1", "title": "概念A", "level": 1 },
        { "id": "w1_n2", "title": "子概念B", "level": 2 },
        { "id": "w1_n3", "title": "子概念C", "level": 2 }
      ]
    }
  ]
}
```

节点 id 格式 `w{week}_n{index}` 保持稳定，`review_node_progress.node_id` 对应此 id。

### user_content_unlocks 表（新建）

```sql
CREATE TABLE user_content_unlocks (
  id            SERIAL PRIMARY KEY,
  user_id       UUID NOT NULL,
  course_id     UUID NOT NULL,
  content_type  TEXT NOT NULL CHECK (content_type IN ('summary', 'outline')),
  unlocked_at   TIMESTAMPTZ DEFAULT now(),
  credits_spent INTEGER NOT NULL,
  UNIQUE(user_id, course_id, content_type)
);
```

---

## Part 2：后端 API

### 管理员端点

| Method | Path | 说明 |
|--------|------|------|
| POST | /admin/courses/{course_id}/content/generate | 触发生成（返回 job_id） |
| GET  | /admin/courses/{course_id}/content/generate/{job_id} | 轮询生成进度 |
| GET  | /admin/courses/{course_id}/content/{type} | 查看内容（draft 也可见） |
| PUT  | /admin/courses/{course_id}/content/{type} | 更新内容/状态 |
| PATCH | /artifacts/{id} | 新增：更新 artifact.week 字段 |

生成逻辑：
- `summary`：按 week 分组 lecture artifacts → 逐周提取文本 → GPT-4o 生成该周摘要 → 合并为 content_json，status=draft
- `outline`：基于 summary content_json 自动派生节点树（key_points → nodes），status=draft

### 用户端点

| Method | Path | 说明 |
|--------|------|------|
| GET  | /courses/{course_id}/content/{type}/status | 返回 locked/unlocked/not_published |
| POST | /courses/{course_id}/content/{type}/unlock | 扣积分 + 写 user_content_unlocks |
| GET  | /courses/{course_id}/content/{type} | 返回 content_json（需已解锁） |

积分消耗：summary=200，outline=300。使用现有 credit_guard 机制。

---

## Part 3：前端改动

### Admin 面板

**ArtifactsTab（已有）**
- 审核/编辑 artifact 时加 Week 下拉选择器（—, 1-10）
- PATCH /artifacts/{id} 更新 week 字段

**新增 CourseContentTab**
- 每门课两张卡片：摘要 / 复习大纲
- 显示：status 徽章、最后更新时间
- 操作：生成按钮（轮询进度）、JSON 编辑器（分周展示可编辑）、发布/下架

### 用户端 SummaryTab

替换现有 TypedOutputsView，三种状态：
- `not_published`：灰色锁 + "管理员正在准备，敬请期待"
- `locked`：金色解锁按钮 + "解锁摘要 200 ✦"
- `unlocked`：分周 Accordion（Week 1▼ Week 2▼...）每周展示 key_points + markdown 正文

### 用户端 OutlineTab（复习大纲）

同样三态门控，解锁需 300 ✦。

解锁后：保留现有复习规划 UI（考试倒计时、勾选、优先级、今日任务推荐），数据来源：
- 节点结构：GET /courses/{id}/content/outline → content_json.weeks[].nodes
- 用户进度：review_node_progress（不变）

### 生成面板（已有）

移除 summary 和 outline 的生成入口，只保留 flashcards 和 quiz。

---

## 解锁流程

```
用户点击解锁
  → POST /courses/{id}/content/{type}/unlock
  → 后端 credit_guard 扣积分
  → 写 user_content_unlocks
  → 前端刷新状态 → 显示内容
```

失败情况：积分不足 → 提示去充值；内容未发布 → 不允许解锁。

---

## 不在本次范围内

- 多语言翻译（ContentTranslationPanel 继续用于 summary 正文）
- 摘要版本历史（只保留最新一份）
- 用户退款积分（解锁后不退）
