"""今日やること（ホーム画面）"""

from __future__ import annotations

import streamlit as st
from sqlalchemy import select

from ..ai.generators import threads_improvement
from ..db import session_scope
from ..departments import DEPT_BY_ROLE
from ..models import NoteProduct
from ..threads_analytics import analysis_facts, posts_frame
from ..today import build_today, ceo_minutes
from ..workflow import create_content
from .common import ai_mode_caption, flash, show_flash
from .nav import link

PRIORITY = {1: ("🔴 今すぐ", "error"), 2: ("🟠 今日中", "warning"), 3: ("🟢 余裕があれば", "info")}


def render() -> None:
    from datetime import date

    from .theme import hero

    show_flash()
    hero("今日やることは、これだけ。", f"{date.today():%Y年%m月%d日}　全部門の状況から、<b>今日の対応</b>を自動で並べています")

    with session_scope() as s:
        plan = build_today(s)
    ceo = [i for i in plan.items if i.role == "社長"]
    c = st.columns(4)
    c[0].metric("今日やること", f"{len(plan.items)}件")
    c[1].metric("社長の対応", f"{len(ceo)}件", help="承認・予約・公開など人間にしかできない作業")
    c[2].metric("社長の作業時間（目安）", f"約{ceo_minutes(plan.items)}分")
    c[3].metric("Threads 今日の投稿", f"{plan.posts_today} / {plan.post_target}本", help="投稿済みの本数／1日の目標（Threads運用で変更可）")

    with st.container(border=True):
        oc = st.columns([4, 1])
        oc[0].markdown("**🪄 おまかせ実行**：数字の取得・口コミ返信案・足りないThreads下書き・集客分析・日次報告を、ボタン1つでまとめて実行（投稿・返信の送信はしません）。")
        if oc[1].button("🪄 おまかせ実行", type="primary", key="omakase_today", use_container_width=True):
            from ..commands import run_command

            with st.spinner("チャドが作業中…"):
                with session_scope() as s:
                    st.session_state["cmd_result"] = run_command(s, "おまかせでまとめてやって")
            st.rerun()

    if not plan.items:
        st.success("🎉 今日やるべきことはすべて終わっています。")

    tab_ceo, tab_all, tab_post = st.tabs([f"👤 社長がやること（{len(ceo)}）", f"🏢 全部門（{len(plan.items)}）", f"🗓 今日の投稿予定（{len(plan.scheduled_today)}）"])
    with tab_ceo:
        _list([i for i in plan.items if i.role == "社長"])
    with tab_all:
        for p in (1, 2, 3):
            group = [i for i in plan.items if i.priority == p]
            if group:
                st.markdown(f"#### {PRIORITY[p][0]}")
                _list(group, show_role=True)
    with tab_post:
        if not plan.scheduled_today:
            st.caption("今日の予約投稿はありません。")
        labels = {"scheduled": "⏰ 予約中", "publishing": "📤 投稿処理中", "published": "✅ 投稿済み", "failed": "⚠️ 失敗"}
        for at, status, head in plan.scheduled_today:
            st.markdown(f"`{at:%H:%M}`　{labels.get(status, status)}　{head}")
        link("threads", "→ Threads運用で予約を管理する")

    lack = max(0, plan.post_target - plan.posts_today - sum(1 for _, s_, _ in plan.scheduled_today if s_ in ("scheduled", "publishing")))
    st.divider()
    st.markdown("#### 🤖 AI社員にまとめて任せる")
    ai_mode_caption()
    with session_scope() as s:
        products = {p.id: p.title for p in s.scalars(select(NoteProduct).where(NoteProduct.status != "停止"))}
    pid = st.selectbox("誘導する note 商品", [None, *products], format_func=lambda i: "（認知拡大のみ）" if i is None else products[i])
    n = st.number_input("作る投稿案の数", 1, 5, value=max(1, min(lack or 2, 5)))
    if st.button("伸びた投稿の型で Threads の下書きを作る", type="primary"):
        with session_scope() as s:
            facts = analysis_facts(posts_frame(s))
            prod = None
            if pid:
                p = s.get(NoteProduct, pid)
                prod = {"title": p.title, "concept": p.concept, "price_yen": p.price_yen, "cta": p.cta}
            res = threads_improvement(s, facts, prod, count=int(n))
            made = 0
            for post in res.data.get("next_posts", [])[: int(n)]:
                create_content(s, "threads", "", post["body"], actor="マーケティングAI", ai_generated=True, note_product_id=pid)
                made += 1
        flash(f"Threads の下書きを{made}本作りました（{res.label}）。コンテンツ管理で確認してレビューに出してください。", "info")
        st.rerun()


def _list(items, show_role: bool = False) -> None:
    if not items:
        st.caption("ありません。")
        return
    for i, it in enumerate(items):
        d = DEPT_BY_ROLE.get(it.role)
        who = f"{d.icon} {d.name}" if d else it.role
        with st.container(border=True):
            cols = st.columns([6, 2])
            cols[0].markdown(f"{PRIORITY[it.priority][0]}　**{it.title}**" + (f"　<small>（{who}）</small>" if show_role else ""), unsafe_allow_html=True)
            cols[0].caption(it.detail)
            link(it.page, "開く →", cols[1])
