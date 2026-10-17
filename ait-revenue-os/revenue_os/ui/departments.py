"""部門ボード：どの部門が・何を・どこまで進めているかを一目で管理する。"""

from __future__ import annotations

from datetime import date, timedelta

import streamlit as st

from ..db import session_scope
from ..departments import DEPARTMENTS, department_statuses, overdue, recent_activity, tasks_by_department
from ..models import Task
from ..report import PRIORITY_LABEL
from .common import flash, fmt_dt, show_flash

ROLE_OPTIONS = [d.role for d in DEPARTMENTS]
ROLE_LABEL = {d.role: f"{d.icon} {d.name}" for d in DEPARTMENTS}


def _cards() -> None:
    with session_scope() as s:
        statuses = department_statuses(s)
    attention = [x for x in statuses if x.needs_attention]
    c = st.columns(4)
    c[0].metric("稼働中の部門（24時間以内）", f"{sum(x.active for x in statuses)} / {len(statuses)}")
    c[1].metric("未完了タスク", f"{sum(x.open_tasks for x in statuses)}件")
    c[2].metric("今週のAI作業", f"{sum(x.ai_runs_7d for x in statuses)}回")
    c[3].metric("要対応の部門", f"{len(attention)}部門")
    if attention:
        st.warning("要対応：" + "、".join(f"{x.dept.icon}{x.dept.name}" for x in attention))

    cols = st.columns(2)
    for i, x in enumerate(statuses):
        with cols[i % 2].container(border=True):
            badge = "🟢 稼働中" if x.active else "⚪ 待機"
            st.markdown(f"### {x.dept.icon} {x.dept.name}　<small>{badge}</small>", unsafe_allow_html=True)
            st.caption(f"担当：{x.dept.role}／{x.dept.mission}／最終活動：{fmt_dt(x.last_activity) if x.last_activity else 'まだなし'}")
            m = st.columns(3)
            m[0].metric("未完了タスク", x.open_tasks)
            m[1].metric("今週の完了", x.done_tasks_7d)
            if x.dept.key == "ceo":
                m[2].metric("—", "")
            else:
                m[2].metric("今週のAI作業", f"{x.ai_runs_7d}回", help=f"今月のAI費用 ¥{x.ai_cost_month_yen:,.0f}")
            for metric in x.metrics:
                st.markdown(f"{'⚠️' if metric.alert else '・'} {metric.label}：**{metric.value}**")


def _task_board() -> None:
    f = st.selectbox("部門で絞り込み", [None, *ROLE_OPTIONS], format_func=lambda r: "すべての部門" if r is None else ROLE_LABEL[r])
    with session_scope() as s:
        board = tasks_by_department(s, f)
        snapshot = {k: [(t.id, t.title, t.role, t.priority, t.due_date, overdue(t), t.note) for t in v] for k, v in board.items()}
    cols = st.columns(3)
    moves = {"未着手": [("▶ 着手", "進行中")], "進行中": [("✅ 完了", "完了"), ("↩ 戻す", "未着手")], "完了": [("↩ 再開", "進行中")]}
    for col, status in zip(cols, ["未着手", "進行中", "完了"], strict=True):
        items = snapshot.get(status, [])
        col.markdown(f"#### {status}（{len(items)}）")
        for tid, title, role, prio, due, late, note in items[: 30 if status != "完了" else 10]:
            with col.container(border=True):
                st.markdown(f"**{title}**")
                st.caption(f"{ROLE_LABEL.get(role, role)}・優先度{PRIORITY_LABEL.get(prio, '中')}" + (f"・期限 {due:%m/%d}" if due else "") + (" ・⚠️期限切れ" if late else ""))
                bcols = st.columns(len(moves[status]))
                for bc, (label, to) in zip(bcols, moves[status], strict=True):
                    if bc.button(label, key=f"mv_{tid}_{to}"):
                        with session_scope() as s:
                            t = s.get(Task, tid)
                            if t:
                                t.status = to
                        st.rerun()

    with st.form("dept_new_task", clear_on_submit=True):
        st.markdown("**部門にタスクを割り当てる**")
        c = st.columns([3, 2, 1, 1])
        title = c[0].text_input("タスク")
        role = c[1].selectbox("担当部門", ROLE_OPTIONS, format_func=ROLE_LABEL.get)
        prio = c[2].selectbox("優先度", [1, 2, 3], index=1, format_func=PRIORITY_LABEL.get)
        due = c[3].date_input("期限", value=date.today() + timedelta(days=3))
        if st.form_submit_button("割り当てる"):
            if not title.strip():
                st.error("タスクを入力してください。")
            else:
                with session_scope() as s:
                    s.add(Task(title=title.strip(), role=role, priority=prio, due_date=due))
                flash(f"{ROLE_LABEL[role]} にタスクを割り当てました。")
                st.rerun()


def _activity() -> None:
    f = st.selectbox("部門で絞り込み ", [None, *ROLE_OPTIONS], format_func=lambda r: "すべての部門" if r is None else ROLE_LABEL[r], key="act_filter")
    with session_scope() as s:
        items = recent_activity(s, 60, f)
    if not items:
        st.caption("まだ記録はありません。")
    for it in items:
        st.markdown(f"`{it.at:%m/%d %H:%M}`　{it.icon} **{it.department}**　{it.text}")


def render() -> None:
    st.title("🏢 部門ボード")
    st.caption("各部門（AI社員）の稼働状況・タスク・活動を、実際の記録から表示します。「稼働中」は24時間以内に記録がある部門です。")
    show_flash()
    tab1, tab2, tab3 = st.tabs(["部門の状況", "タスクボード", "活動ログ"])
    with tab1:
        _cards()
    with tab2:
        _task_board()
    with tab3:
        _activity()
