"""UNSW Exam Master — Admin Panel (port 8051)

Admin-only management interface.
Navigation: Dashboard → Course Management (click course → file management) → User Management
"""

from __future__ import annotations

import os
from pathlib import Path

import requests
import streamlit as st
from dotenv import load_dotenv

# ── Config ────────────────────────────────────────────────────────────────────

_env_path = Path(__file__).resolve().parents[1] / "backend" / ".env"
load_dotenv(_env_path)

API_URL = os.getenv("API_URL", "http://localhost:8000")
ADMIN_SECRET = os.getenv("ADMIN_SECRET", "")

st.set_page_config(
    page_title="Admin Panel — UNSW Exam Master",
    page_icon="🛠️",
    layout="wide",
)

st.markdown("""
<style>
  [data-testid="stAppViewContainer"] { background: #0D0D0D; }
  [data-testid="stSidebar"] { background: #0A0A0A; border-right: 1px solid rgba(255,215,0,0.15); }
  [data-testid="stSidebar"] * { color: #C9D1D9 !important; }
  h1,h2,h3 { color: #FFD700 !important; }
  .metric-card {
    background: rgba(20,20,20,0.75);
    border: 1px solid rgba(255,215,0,0.15);
    border-radius: 12px; padding: 20px; text-align: center;
  }
  .metric-value { font-size: 2rem; font-weight: 700; color: #FFD700; }
  .metric-label { font-size: 0.85rem; color: #666; margin-top: 4px; }
  .badge-pending  { background:rgba(255,165,0,0.15); color:#FFA500; padding:2px 8px; border-radius:4px; font-size:0.8rem; }
  .badge-approved { background:rgba(0,200,100,0.15); color:#00C864; padding:2px 8px; border-radius:4px; font-size:0.8rem; }
  .badge-rejected { background:rgba(255,68,68,0.15);  color:#FF4444; padding:2px 8px; border-radius:4px; font-size:0.8rem; }
</style>
""", unsafe_allow_html=True)


# ── Auth ──────────────────────────────────────────────────────────────────────

def _check_login() -> bool:
    if st.session_state.get("admin_authed"):
        return True
    st.title("🛠️ Admin Panel")
    st.markdown("---")
    with st.form("login_form"):
        secret = st.text_input("Admin Secret", type="password")
        if st.form_submit_button("Login", use_container_width=True):
            if secret == ADMIN_SECRET and ADMIN_SECRET:
                st.session_state["admin_authed"] = True
                st.rerun()
            else:
                st.error("Invalid admin secret")
    return False


# ── API helpers ───────────────────────────────────────────────────────────────

def _h() -> dict:
    return {"X-Admin-Secret": ADMIN_SECRET}


def _get(path: str, params: dict | None = None):
    try:
        r = requests.get(API_URL + path, headers=_h(), params=params, timeout=10)
        r.raise_for_status()
        return r.json()
    except requests.HTTPError as e:
        st.error(f"API {e.response.status_code}: {e.response.text[:200]}")
    except Exception as e:
        st.error(f"连接失败: {e}")
    return None


def _post(path: str, json: dict | None = None, files=None):
    try:
        headers = _h() if not files else {k: v for k, v in _h().items()}
        r = requests.post(API_URL + path, headers=headers, json=json, files=files, timeout=60)
        r.raise_for_status()
        return r.json()
    except requests.HTTPError as e:
        st.error(f"API {e.response.status_code}: {e.response.text[:200]}")
    except Exception as e:
        st.error(f"请求失败: {e}")
    return None


def _patch(path: str, json: dict | None = None):
    try:
        r = requests.patch(API_URL + path, headers=_h(), json=json, timeout=10)
        r.raise_for_status()
        return r.json()
    except requests.HTTPError as e:
        st.error(f"API {e.response.status_code}: {e.response.text[:200]}")
    except Exception as e:
        st.error(f"请求失败: {e}")
    return None


def _delete(path: str, params: dict | None = None):
    try:
        r = requests.delete(API_URL + path, headers=_h(), params=params, timeout=10)
        r.raise_for_status()
        return r.json()
    except requests.HTTPError as e:
        st.error(f"API {e.response.status_code}: {e.response.text[:200]}")
    except Exception as e:
        st.error(f"请求失败: {e}")
    return None


# ── Pages ─────────────────────────────────────────────────────────────────────

def page_dashboard():
    st.title("📊 数据概览")
    st.markdown("---")

    courses = _get("/admin/courses") or []
    pending = _get("/admin/artifacts", params={"status": "pending"}) or []
    approved = _get("/admin/artifacts", params={"status": "approved"}) or []
    users = _get("/admin/users") or []

    c1, c2, c3, c4 = st.columns(4)
    for col, value, label, color in [
        (c1, len(courses), "课程总数", "#FFD700"),
        (c2, len(pending), "待审核文件", "#FFA500"),
        (c3, len(approved), "已通过文件", "#00C864"),
        (c4, len(users), "注册用户", "#8888FF"),
    ]:
        with col:
            st.markdown(f"""<div class="metric-card">
                <div class="metric-value" style="color:{color}">{value}</div>
                <div class="metric-label">{label}</div>
            </div>""", unsafe_allow_html=True)

    if pending:
        st.markdown("---")
        st.subheader(f"⏳ 待审核文件 ({len(pending)} 个)")
        # Build course id→name map
        course_map = {c["id"]: f"{c['code']} {c['name']}" for c in courses}
        for a in pending[:8]:
            course_label = course_map.get(a["course_id"], a["course_id"][:12] + "…")
            st.markdown(
                f"- **{a['file_name']}** | {course_label} | "
                f"<span class='badge-pending'>pending</span>",
                unsafe_allow_html=True,
            )
        if len(pending) > 8:
            st.caption(f"…还有 {len(pending) - 8} 个，前往「课程管理」各课程内审核")

    if st.button("🩺 检测 API 状态"):
        try:
            r = requests.get(API_URL + "/health", timeout=5)
            if r.ok:
                d = r.json()
                st.success(f"FastAPI: {d.get('status')} | Supabase: {d.get('supabase')}")
            else:
                st.error(f"HTTP {r.status_code}")
        except Exception as e:
            st.error(f"连接失败: {e}")


def page_courses():
    """Course list → click course → course detail with file management."""
    st.title("📚 课程管理")
    st.markdown("---")

    # If a course is selected, show course detail
    if st.session_state.get("selected_course"):
        _course_detail(st.session_state["selected_course"])
        return

    # ── Create course ──
    with st.expander("➕ 创建新课程", expanded=False):
        with st.form("create_course"):
            col1, col2 = st.columns(2)
            with col1:
                code = st.text_input("课程代码", placeholder="COMP9517")
            with col2:
                name = st.text_input("课程名称", placeholder="计算机视觉")
            if st.form_submit_button("创建", use_container_width=True):
                if code.strip() and name.strip():
                    result = _post("/admin/courses", json={"code": code.strip().upper(), "name": name.strip()})
                    if result:
                        st.success(f"创建成功: {result['code']} — {result['name']}")
                        st.rerun()
                else:
                    st.warning("请填写课程代码和名称")

    # ── Course list ──
    courses = _get("/admin/courses") or []
    if not courses:
        st.info("暂无课程")
        return

    search = st.text_input("🔍 搜索课程", placeholder="输入课程代码或名称", key="course_search").strip().lower()
    filtered = [c for c in courses if not search or search in c["code"].lower() or search in c["name"].lower()]

    st.caption(f"共 {len(courses)} 门课程{f'（已筛选 {len(filtered)} 条）' if search else ''} · 点击课程名称进入管理")
    st.markdown("---")

    for c in filtered:
        col1, col2, col3, col4 = st.columns([2, 4, 2, 1])
        with col1:
            st.code(c["code"])
        with col2:
            if st.button(f"📂 {c['name']}", key=f"open_{c['id']}", use_container_width=True):
                st.session_state["selected_course"] = c
                st.rerun()
        with col3:
            st.caption(c.get("created_at", "")[:10])
        with col4:
            if st.button("🗑️", key=f"del_{c['id']}", help="删除课程"):
                if _delete(f"/admin/courses/{c['id']}"):
                    st.success("已删除")
                    st.rerun()


def _course_detail(course: dict):
    """Course detail page with tabbed file management."""
    col_back, col_title = st.columns([1, 8])
    with col_back:
        if st.button("← 返回"):
            del st.session_state["selected_course"]
            st.rerun()
    with col_title:
        st.subheader(f"📂 {course['code']} — {course['name']}")

    st.markdown("---")

    col_reindex, col_space = st.columns([2, 6])
    with col_reindex:
        if st.button("🔄 重建 RAG 索引", key=f"reindex_{course['id']}", use_container_width=True,
                     help="对本课程所有已通过文件重新清洗、分块、向量化"):
            with st.spinner("正在重建索引，请稍候…"):
                result = _post(f"/admin/courses/{course['id']}/reindex")
                if result:
                    st.success(f"索引完成：处理 {result.get('processed',0)} 个文件，生成 {result.get('chunks',0)} 个片段，失败 {result.get('errors',0)} 个")

    st.markdown("---")

    tab_files, tab_pending, tab_upload = st.tabs(["📄 已通过文件", "⏳ 待审核", "📤 上传文件"])

    with tab_files:
        _tab_approved_files(course)

    with tab_pending:
        _tab_pending_files(course)

    with tab_upload:
        _tab_upload(course)


def _tab_approved_files(course: dict):
    """List approved artifacts with delete option."""
    artifacts = _get("/admin/artifacts", params={"status": "approved", "course_id": course["id"]}) or []

    if not artifacts:
        st.info("该课程暂无已通过文件")
        return

    st.caption(f"共 {len(artifacts)} 个已通过文件")
    st.markdown("---")

    for a in artifacts:
        col1, col2, col3 = st.columns([5, 2, 1])
        with col1:
            st.markdown(f"**{a['file_name']}**")
            st.caption(f"`{a.get('file_type','?')}` | {a.get('created_at','')[:10]}")
        with col2:
            st.markdown(f"<span class='badge-approved'>approved</span>", unsafe_allow_html=True)
        with col3:
            if st.button("🗑️", key=f"del_art_{a['id']}", help="删除"):
                if _delete(f"/admin/artifacts/{a['id']}", params={"course_id": course["id"]}):
                    st.success("已删除")
                    st.rerun()
        st.divider()


def _tab_pending_files(course: dict):
    """Review queue for pending artifacts in this course."""
    artifacts = _get("/admin/artifacts", params={"status": "pending", "course_id": course["id"]}) or []

    if not artifacts:
        st.success("✅ 没有待审核文件")
        return

    st.caption(f"{len(artifacts)} 个待审核")
    st.markdown("---")

    for a in artifacts:
        col1, col2, col3 = st.columns([5, 1, 2])
        with col1:
            st.markdown(f"**{a['file_name']}**")
            st.caption(f"`{a.get('file_type','?')}` | {a.get('created_at','')[:10]}")
        with col2:
            st.markdown("<span class='badge-pending'>待审核</span>", unsafe_allow_html=True)
        with col3:
            b1, b2 = st.columns(2)
            with b1:
                if st.button("✅ 通过", key=f"approve_{a['id']}", use_container_width=True):
                    if _patch(f"/admin/artifacts/{a['id']}/approve"):
                        st.success("已通过")
                        st.rerun()
            with b2:
                if st.button("❌ 拒绝", key=f"reject_{a['id']}", use_container_width=True):
                    st.session_state[f"show_reject_{a['id']}"] = True

        if st.session_state.get(f"show_reject_{a['id']}"):
            reason = st.text_input("拒绝原因（可选）", key=f"reason_{a['id']}")
            if st.button("确认拒绝", key=f"confirm_{a['id']}"):
                if _patch(f"/admin/artifacts/{a['id']}/reject", json={"reason": reason}):
                    st.session_state.pop(f"show_reject_{a['id']}", None)
                    st.success("已拒绝")
                    st.rerun()
        st.divider()


def _tab_upload(course: dict):
    """Admin direct upload (auto-approved) and URL add."""
    st.markdown("直接上传的文件**跳过审核**，立即置为 approved。")

    u_tab, url_tab = st.tabs(["📄 上传文件", "🔗 添加 URL"])

    with u_tab:
        uploaded = st.file_uploader(
            "选择文件（PDF / Word / Python）",
            type=["pdf", "docx", "doc", "py"],
            accept_multiple_files=True,
            key=f"uploader_{course['id']}",
        )
        if st.button("上传", disabled=not uploaded, use_container_width=True, key=f"upload_btn_{course['id']}"):
            ok = 0
            for f in uploaded:
                res = _post(
                    f"/admin/courses/{course['id']}/artifacts",
                    files={"file": (f.name, f.getvalue(), f.type or "application/octet-stream")},
                )
                if res:
                    ok += 1
            if ok:
                st.success(f"成功上传 {ok} 个文件")
                st.rerun()

    with url_tab:
        with st.form(f"add_url_{course['id']}"):
            url = st.text_input("URL", placeholder="https://example.com/lecture.pdf")
            display_name = st.text_input("显示名称（可选）")
            if st.form_submit_button("添加", use_container_width=True):
                if url.strip():
                    res = _post(
                        f"/admin/courses/{course['id']}/artifacts/url",
                        json={"url": url.strip(), "display_name": display_name.strip()},
                    )
                    if res:
                        st.success(f"添加成功: {res['file_name']}")
                        st.rerun()
                else:
                    st.warning("请输入 URL")


def page_users():
    st.title("👥 用户管理")
    st.markdown("---")

    col1, col2 = st.columns([1, 2])
    with col1:
        if st.button("🔄 刷新", use_container_width=True):
            st.rerun()
    with col2:
        if st.button("🩺 检测 API", use_container_width=True):
            try:
                r = requests.get(API_URL + "/health", timeout=5)
                d = r.json() if r.ok else {}
                status = "online" if r.ok else f"error {r.status_code}"
                st.info(f"FastAPI: {status} | Supabase: {d.get('supabase', '?')}")
            except Exception as e:
                st.error(f"连接失败: {e}")

    users = _get("/admin/users") or []
    if not users:
        st.info("暂无用户数据")
        return

    st.caption(f"共 {len(users)} 名用户")
    st.markdown("---")

    for u in users:
        c1, c2, c3, c4 = st.columns([3, 3, 2, 2])
        with c1:
            st.write(f"📧 {u.get('email', '—')}")
        with c2:
            st.caption(f"ID: `{u['id'][:12]}…`")
        with c3:
            st.caption(f"注册: {u.get('created_at', '')[:10]}")
        with c4:
            last = u.get("last_sign_in_at") or ""
            confirmed = "✅" if u.get("email_confirmed") else "❌"
            st.caption(f"{confirmed} {last[:10] if last else '从未登录'}")
        st.divider()


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    if not _check_login():
        return

    with st.sidebar:
        st.markdown("## 🛠️ Admin Panel")
        st.markdown("---")
        page = st.radio(
            "导航",
            ["📊 数据概览", "📚 课程管理", "👥 用户管理"],
            label_visibility="hidden",
        )
        st.markdown("---")
        if st.button("退出登录", use_container_width=True):
            st.session_state.clear()
            st.rerun()

    if page == "📊 数据概览":
        page_dashboard()
    elif page == "📚 课程管理":
        # Clear course selection when switching away and back
        if st.session_state.get("_last_page") != "courses":
            st.session_state["_last_page"] = "courses"
        page_courses()
    elif page == "👥 用户管理":
        st.session_state["_last_page"] = "users"
        page_users()


if __name__ == "__main__":
    main()
