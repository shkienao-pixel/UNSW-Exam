# UNSW Exam Master — Claude 项目规则

## Bug 修复和需求开发流程（必须遵守）

所有 bug 修复和功能需求必须按以下流程执行：

1. **planner** — 拆解需求，制定实现方案
2. **code-reviewer** — 审查逻辑、质量和安全
3. **executor（Claude 直接执行）** — 按计划实现代码
4. **build-error-resolver** — 验证构建无报错，修复类型错误

任何阶段失败必须停止并报告，不可自行跳过。

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
