# UNSW Exam Master — API 文档

> 版本：1.0.0  生产环境：https://api.exammaster.tech

## 认证说明

| 类型 | 方式 | 适用范围 |
|------|------|-------|
| 用户 JWT | Authorization: Bearer access_token | 所有用户端点 |
| 管理员 | X-Admin-Secret: secret | /admin/* 所有端点 |

- access_token 通过 /auth/login 或 /auth/verify-otp 获取，有效期 1 小时
- 积分不足时返回 **HTTP 402**

---

## 目录

- [System](#system)
- [Auth — 认证](#auth)
- [Courses — 课程](#courses)
- [Artifacts — 文件管理](#artifacts)
- [Scope Sets — 范围集](#scope-sets)
- [Outputs — 生成内容](#outputs)
- [Content — 文本提取](#content)
- [Generation — AI 生成](#generation)
- [Credits — 积分](#credits)
- [Enrollments — 选课](#enrollments)
- [Review — 复习计划](#review)
- [Feedback — 用户反馈](#feedback)
- [Exam — 真题与模拟卷](#exam)
- [Course Content — 课程发布内容](#course-content)
- [Planner — 复习追踪](#planner)
- [Admin — 管理员接口](#admin)
- [通用错误码](#errorcode)

---

## System

### GET /health
健康检查，供 Docker/负载均衡探针使用。**无需认证**

**响应 200** { status: ok, supabase: connected }

---

## Auth

### POST /auth/register
开始注册。验证邀请码并发送 OTP，**不消费邀请码**（消费在 /verify-otp）。

**请求体** { email, password, invite_code }
**响应 200** { status: otp_sent, email }
**错误** 400 邀请码无效或已用完

### POST /auth/verify-otp
验证 OTP，消费邀请码，完成注册。注册成功奖励 5 积分。

**请求体** { email, token }
**响应 200** TokenResponse { access_token, refresh_token, expires_in }

### POST /auth/resend-otp
重新发送 OTP 邮件。**请求体** { email }  **响应 200** { ok: true }

### POST /auth/guest-token
获取游客账号 JWT Token（无需邀请码）。**响应 200** TokenResponse

### POST /auth/login
邮箱密码登录。**请求体** { email, password }
**响应 200** TokenResponse  **错误** 401

### POST /auth/refresh
用 refresh_token 换新的 access_token。**请求体** { refresh_token }  **响应 200** TokenResponse

### POST /auth/request-reset
发送密码重置邮件（始终返回成功，防止邮箱枚举）。**请求体** { email }

### POST /auth/reset-password
用 recovery token 重置密码。**请求体** { access_token, new_password }

### POST /auth/logout
注销当前会话（全局登出）。**认证** Bearer  **响应** 204

### GET /auth/me
获取当前用户信息。**认证** Bearer  **响应 200** { id, email }

---

## Courses

### GET /courses
列出所有共享课程。**认证** Bearer

### GET /courses/{course_id}
获取单个课程详情。**认证** Bearer  **错误** 404

---

## Artifacts

### GET /courses/{course_id}/artifacts
列出课程文件。**认证** Bearer  **查询参数** status = pending | approved(默认) | rejected

### POST /courses/{course_id}/artifacts
用户上传文件（进入审核队列，最大 50 MB）。**认证** Bearer

**请求体** multipart/form-data: file(必填), doc_type(默认 lecture)

**doc_type 可选值**: lecture tutorial revision past_exam assignment other

### POST /courses/{course_id}/artifacts/url
用户提交 URL 引用（进入审核队列）。**认证** Bearer  **请求体** { url, display_name }

### POST /courses/{course_id}/artifacts/{artifact_id}/unlock
花 **50 积分**解锁他人文件。幂等，已解锁不重复扣费。**认证** Bearer

**响应 200** { ok, already_unlocked, storage_url }  **错误** 402 积分不足

### POST /courses/{course_id}/artifacts/unlock-all
一次性解锁课程内所有锁定文件。**认证** Bearer

**响应 200** { ok, locked_count, unlocked_count, credits_spent }

### PATCH /courses/{course_id}/artifacts/{artifact_id}/doc-type
上传者修改文件分类（异步同步 ChromaDB）。**认证** Bearer(仅上传者)  **错误** 403

**请求体** { doc_type: lecture|tutorial|revision|past_exam|assignment|other }

### DELETE /courses/{course_id}/artifacts/{artifact_id}
删除文件。**认证** Bearer  **响应 200** { ok, id }

---

## Scope Sets

范围集指定哪些文件参与 AI 生成，支持多套配置。

### GET /courses/{course_id}/scope-sets
列出范围集，若无则自动创建默认(全量)集。**认证** Bearer

### POST /courses/{course_id}/scope-sets
创建新范围集。**认证** Bearer  **请求体** { name }

### GET /courses/{course_id}/scope-sets/{scope_set_id}
获取单个范围集(含文件 ID 列表)。**认证** Bearer

### PATCH /courses/{course_id}/scope-sets/{scope_set_id}
重命名范围集。**认证** Bearer  **请求体** { name }

### DELETE /courses/{course_id}/scope-sets/{scope_set_id}
删除范围集。**认证** Bearer  **响应 200** { ok, id }

### PUT /courses/{course_id}/scope-sets/{scope_set_id}/items
替换范围集内文件列表(防 IDOR；未解锁文件不可加入)。**认证** Bearer
**请求体** { artifact_ids: [1, 2, 3] }

---

## Outputs

### GET /courses/{course_id}/outputs
列出已生成内容，可按类型过滤。**认证** Bearer
**查询参数** output_type = summary | quiz | outline | flashcards

### GET /courses/{course_id}/outputs/{output_id}
获取单个生成内容。**认证** Bearer

### DELETE /courses/{course_id}/outputs/{output_id}
删除生成内容。**认证** Bearer  **响应 200** { ok, id }

---

## Content

### GET /courses/{course_id}/content
提取课程文件文本(前端预览生成范围)。**认证** Bearer

**优先级**: artifact_ids > scope_set_id > 全部已审核文件

**查询参数** scope_set_id(integer), artifact_ids(逗号分隔 ID)

**响应 200** { course_id, artifacts:[{id,name,type,text}], total_chars, artifact_count }

---

## Generation

所有生成接口立即返回 job_id，通过轮询查询结果。

### POST /courses/{course_id}/generate/summary
### POST /courses/{course_id}/generate/quiz
### POST /courses/{course_id}/generate/outline
### POST /courses/{course_id}/generate/flashcards

**认证** Bearer  **错误** 402 积分不足

**请求体** GenerateRequest(所有字段均可选): scope_set_id, artifact_ids, num_questions, exclude_topics

**响应 200** { job_id }

### GET /courses/{course_id}/jobs/{job_id}
轮询异步生成任务状态。前端建议每 2 秒轮询，超时 5 分钟。**认证** Bearer

**响应 200** { status, output_id, error_msg }

| status | 含义 |
|--------|------|
| pending | 排队中 |
| processing | 生成中 |
| done | 完成，output_id 有值 |
| failed | 失败，error_msg 有值 |

### POST /courses/{course_id}/generate/ask
RAG 问答(同步)。流水线: pgvector检索→GPT-4o-mini过滤→Gemini生成→可选Imagen配图。Gemini失败时自动回退至GPT-4o。

**认证** Bearer  **错误** 402

**请求体** { question, scope_set_id?, context_mode: all|revision, history? }

**响应 200** { question, answer, sources:[{artifact_id,file_name,storage_url}], image_url, model_used }

### POST /courses/{course_id}/generate/ask/stream
流式 SSE 问答。实时推送 tokens，失败时自动退款。**认证** Bearer

**请求体** 同 /ask  **响应** text/event-stream

事件格式: {type:status,phase:filtering} / {type:token,text:...} / {type:done,...} / {type:error,...}

### POST /courses/{course_id}/generate/translate
批量翻译文本(GPT-4o-mini)。**认证** Bearer
**请求体** { texts:[...], target_lang: en|zh }  **响应 200** { translations:[...] }

---

## Credits

### GET /credits/balance
获取积分余额。**认证** Bearer  **响应 200** { balance }

### POST /credits/check
验证是否有足够积分(**不扣费**)。**认证** Bearer
**请求体** { type_: gen_ask|gen_summary|gen_quiz|gen_outline|gen_flashcards|unlock_upload }
**响应 200** { ok, balance, required }  **错误** 402

### POST /credits/deduct
扣除积分。**认证** Bearer  **请求体** { type_ }  **响应 200** { balance }

### GET /credits/transactions
积分交易历史。**认证** Bearer

---

## Enrollments

### GET /enrollments/status
获取当前学期配置和已选课程 ID。**认证** Bearer

### GET /enrollments
列出当前学期选课记录。**认证** Bearer

### POST /enrollments
选课(花积分)。**认证** Bearer  **请求体** { course_id }
**响应 200** { ok, enrollment, term, year }  **错误** 402

### GET /enrollments/check/{course_id}
检查是否已选某课程。**认证** Bearer  **响应 200** { enrolled, term, year }

---

## Review

### GET /review/settings
获取复习计划配置。**认证** Bearer  **查询参数** course_id(必填)

### POST /review/settings
保存/更新复习计划配置(upsert)。**认证** Bearer
**请求体** { course_id, review_start_at?, exam_at? }

### GET /review/progress
获取用户该课程所有大纲节点进度记录。**认证** Bearer  **查询参数** course_id(必填)

### POST /review/progress
批量 upsert 节点进度(仅更新提供的字段)。**认证** Bearer
**请求体** { course_id, updates:[{node_id, done?, priority?, estimate_minutes?}] }
**响应 200** { ok, updated }

### POST /review/today_plan
计算今日推荐复习节点。**认证** Bearer

**算法**: 每日目标 = ceil(未做数 / max(1,剩余天数))，限制 [3, 15]

**请求体** { course_id, outline_nodes:[...], budget_minutes:60, allow_spacing:true }
**响应 200** { node_ids, target_count, remaining_days, total_undone }

---

## Feedback

### POST /feedback
提交用户反馈(任何页面均可)。**认证** Bearer
**请求体** { content(1-2000字), page_url }  **响应 200** { ok, id }

---

## Exam

### GET /courses/{course_id}/exam/past-exams
列出已提取题目的真题文件。**认证** Bearer

### GET /courses/{course_id}/exam/questions
获取题目列表(含用户答题记录和收藏状态)。**认证** Bearer
**查询参数**(二选一): artifact_id 或 mock_session_id
**响应 200** { questions:[...], total }

### POST /courses/{course_id}/exam/mock/generate
触发异步生成模拟卷题目。**认证** Bearer
**请求体** { num_mcq:10, num_short:5 }  **响应 200** { job_id, session_id }

之后用 GET /courses/{course_id}/jobs/{job_id} 轮询，完成后用 session_id 查询题目。

### GET /courses/{course_id}/exam/mock/sessions
列出历史模拟卷会话。**认证** Bearer

### POST /courses/{course_id}/exam/submit
提交答题，AI 自动批改(选择题本地判断，短答题 GPT 批改)。**认证** Bearer
**请求体** { answers:[{question_id, user_answer}] }
**响应 200** { results:[{question_id, is_correct, feedback}] }

### POST /courses/{course_id}/exam/favorites/{question_id}
切换题目收藏状态(toggle)。**认证** Bearer  **响应 200** { is_favorite }

### GET /courses/{course_id}/exam/favorites
列出该课程收藏的题目。**认证** Bearer

### GET /exam/favorites
列出用户在**所有课程**收藏的题目(错题本页面)。**认证** Bearer

---

## Course Content

管理员发布的课程级内容(精选摘要/大纲)，用户需花积分解锁。

### GET /courses/{course_id}/course-content/{content_type}/status
获取内容状态和解锁费用。**认证** Bearer  content_type: summary|outline
**响应 200** { status: locked|unlocked|not_published, credits_required }

### POST /courses/{course_id}/course-content/{content_type}/unlock
花积分解锁(幂等)。**认证** Bearer  **响应 200** { ok, already_unlocked, credits_spent? }

### GET /courses/{course_id}/course-content/{content_type}
获取已解锁内容。**认证** Bearer  **响应 200** { content_json }

### GET /courses/{course_id}/course-content/{content_type}/admin
管理员获取内容(无需解锁)。**认证** X-Admin-Secret
**响应 200** { status: draft|published|hidden|not_generated, content_json, updated_at }

### PUT /courses/{course_id}/course-content/{content_type}/admin
管理员更新/发布内容。**认证** X-Admin-Secret
**请求体** { content_json?, status?: draft|published|hidden }

### POST /courses/{course_id}/course-content/{content_type}/refine
管理员用 LLM 从原始文本生成内容架构，存为草稿。**认证** X-Admin-Secret
**请求体** { context: 原始文本... }  **响应 200** { status:draft, content_json }

---

## Planner

### GET /courses/{course_id}/planner
生成用户考试复习计划(基于 blueprint + 用户进度)。**认证** Bearer

### POST /courses/{course_id}/planner/toggle
标记考点或真题为完成/未完成。**认证** Bearer
**请求体** { item_type: kp|paper, item_id, done }  **响应 200** { ok }

---

## Admin

所有接口均需 X-Admin-Secret 请求头。
错误的 Secret 触发 IP 速率限制(60s 内 10 次失败 → 锁定 300s)。

### 文件管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /admin/artifacts | 列出文件(?status=pending) |
| PATCH | /admin/artifacts/{id}/approve | 批准(触发 RAG 索引+题目提取，奖励上传者 1 积分) |
| PATCH | /admin/artifacts/{id}/reject | 拒绝(清理向量) |
| POST | /admin/artifacts/{id}/extract-questions | 手动(重新)提取 past_exam 题目 |
| PATCH | /admin/artifacts/{id}/doc-type | 修改文件分类 |
| PATCH | /admin/artifacts/{id}/week | 标记教学周(1-10 或 null) |
| DELETE | /admin/artifacts/{id} | 删除文件(需 ?course_id=) |
| POST | /admin/courses/{id}/artifacts | 直传文件(立即批准) |
| POST | /admin/courses/{id}/artifacts/url | 添加 URL 引用(立即批准) |
| POST | /admin/courses/{id}/reindex | 重新索引所有已批准文件 |
| POST | /admin/courses/{id}/extract-all-questions | 重新提取全部 past_exam 题目 |
| GET | /admin/courses/{id}/extraction-status | 题目提取进度 { total, done } |

### 课程管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /admin/courses | 列出所有课程 |
| POST | /admin/courses | 创建课程 { code, name, exam_date? } |
| PATCH | /admin/courses/{id}/exam-date | 设置/清除考试日期 |
| DELETE | /admin/courses/{id} | 删除课程(级联删除所有关联数据) |

### 用户管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /admin/users | 列出所有用户(?include_unverified=true) |
| POST | /admin/users/{id}/confirm-email | 强制确认邮箱 |
| DELETE | /admin/users/{id} | 硬删除用户 |
| GET | /admin/users/credits | 所有用户积分余额 map |
| POST | /admin/users/{id}/credits/adjust | 手动增减积分 { action:add/deduct, amount, note? } |

### 邀请码

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /admin/invites | 列出邀请码 |
| POST | /admin/invites | 生成邀请码 { note?, max_uses? } |
| DELETE | /admin/invites/{id} | 删除邀请码 |

### API 密钥管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /admin/api-keys | 列出密钥(掩码) |
| POST | /admin/api-keys | 添加密钥(自动激活，同 provider 其他失活) |
| PATCH | /admin/api-keys/{id}/activate | 切换激活密钥 |
| DELETE | /admin/api-keys/{id} | 删除密钥 |

provider 可选值: openai gemini deepseek

### 反馈管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /admin/feedback | 列出反馈(?status=, ?limit=100, ?offset=0) |
| GET | /admin/feedback/ai-summary | DeepSeek AI 分析，生成 PM 报告(需 DEEPSEEK_API_KEY) |
| PATCH | /admin/feedback/{id} | 更新状态(adopted 时奖励提交者 1 积分) |

状态流转: pending → in_progress → resolved → adopted

### 积分管理

POST /admin/credits/grant -- 赠予积分 { user_id, amount, note? }

### 复习计划模板

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /admin/planner/{course_id} | 获取 blueprint |
| PUT | /admin/planner/{course_id} | 创建/更新 blueprint |
| DELETE | /admin/planner/{course_id} | 删除 blueprint |

---

## 通用错误码

| HTTP | 含义 |
|------|------|
| 400 | 请求参数错误 |
| 401 | 未认证或 Token 已过期 |
| 402 | 积分不足 |
| 403 | 无权限(如非上传者) |
| 404 | 资源不存在 |
| 413 | 文件超过 50 MB |
| 429 | 速率限制(管理员接口) |
| 500 | 服务内部错误 |
