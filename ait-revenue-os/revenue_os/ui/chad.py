"""8. チャド日次報告"""

from __future__ import annotations

from datetime import date

import pandas as pd
import streamlit as st
from sqlalchemy import select

from ..ai.roles import ROLES
from ..db import session_scope
from ..models import TASK_STATUSES, DailyReport, Task
from ..report import PRIORITY_LABEL, generate_daily_report
from .common import ai_mode_caption, flash, fmt_dt, include_sample, show_flash


def render() -> None:
    st.title("🧭 チャド日次報告")
    st.caption("実績はデータベースの数字だけで作ります。改善提案はAI（またはテンプレート）による仮説で、実績とは分けて表示します。")
    show_flash()
    ai_mode_caption()

    c1, c2 = st.columns([2, 1])
    day = c1.date_input("報告日", value=date.today())
    if c2.button("📝 日次報告を作成", type="primary"):
        with session_scope() as s:
            _, notice = generate_daily_report(s, day, include_sample())
        flash(f"日次報告を作成し、優先タスクを登録しました。{notice}")
        st.rerun()

    with session_scope() as s:
        reports = s.scalars(select(DailyReport).order_by(DailyReport.id.desc()).limit(10)).all()
        data = [(r.id, r.report_date, r.facts_md, r.suggestions_md, r.priorities_md, r.generated_by, r.created_at) for r in reports]
    if not data:
        st.info("まだ報告はありません。「日次報告を作成」を押してください。")
    for i, (rid, rdate, facts, sugg, prio, by, created) in enumerate(data):
        with st.expander(f"{rdate:%Y/%m/%d} の報告（作成 {fmt_dt(created)}・{'AI' if by == 'api' else 'テンプレート'}）", expanded=i == 0):
            st.markdown("#### 🟢 実績（確認済みのデータ）")
            st.markdown(facts)
            st.markdown("#### 🟡 改善提案（仮説・要検証）")
            st.markdown(sugg)
            st.markdown("#### 🎯 優先タスク")
            st.markdown(prio)

    st.subheader("タスク")
    with session_scope() as s:
        tasks = s.scalars(select(Task).order_by(Task.status, Task.priority, Task.id)).all()
        rows = [{"ID": t.id, "": "🧪" if t.is_sample else "", "優先度": PRIORITY_LABEL.get(t.priority, "中"), "タスク": t.title, "担当": t.role, "期限": t.due_date, "状態": t.status} for t in tasks]
    if rows:
        edited = st.data_editor(
            pd.DataFrame(rows),
            hide_index=True,
            width="stretch",
            disabled=["ID", "", "優先度", "タスク", "担当", "期限"],
            column_config={"状態": st.column_config.SelectboxColumn("状態", options=TASK_STATUSES)},
            key="task_editor",
        )
        if st.button("タスクの状態を保存"):
            with session_scope() as s:
                for row in edited.to_dict(orient="records"):
                    t = s.get(Task, int(row["ID"]))
                    if t and t.status != row["状態"]:
                        t.status = row["状態"]
            flash("保存しました。")
            st.rerun()
    with st.form("new_task", clear_on_submit=True):
        st.markdown("**タスクを追加**")
        title = st.text_input("タスク")
        role = st.selectbox("担当", ["社長", *ROLES])
        prio = st.selectbox("優先度", [1, 2, 3], index=1, format_func=PRIORITY_LABEL.get)
        if st.form_submit_button("追加") and title.strip():
            with session_scope() as s:
                s.add(Task(title=title.strip(), role=role, priority=prio))
            flash("追加しました。")
            st.rerun()

    with st.expander("👥 AI社員の役割"):
        for name, desc in ROLES.items():
            st.markdown(f"- **{name}**：{desc}")
