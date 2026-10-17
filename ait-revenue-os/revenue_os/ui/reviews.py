"""口コミ対策：口コミを記録し、AIが返信の下書きを作る（返信は自分で投稿）。"""

from __future__ import annotations

from datetime import date

import streamlit as st
from sqlalchemy import select

from ..acquisition import add_review, mark_replied, review_stats
from ..ai.generators import review_reply
from ..db import session_scope
from ..models import Review
from ..threads_analytics import get_setting, set_setting
from .common import ai_mode_caption, flash, fmt_dt, show_ai_result, show_flash
from .theme import hero

PLATFORMS = {"google": "Googleマップ", "hotpepper": "ホットペッパー", "ekiten": "エキテン", "other": "その他"}
RULES = [
    "口コミと引き換えに割引・特典を渡さない（各サービスの規約違反になるおそれ）",
    "自分や知人による口コミの自作自演はしない",
    "否定的な口コミにも、反論せず改善の姿勢で返信する",
    "返信に、お客様を特定できる情報や来店内容を書かない",
]


def render() -> None:
    show_flash()
    hero("口コミを、信頼に変える。", "<b>未返信ゼロ</b>を目指して、返信の下書きはAIが作成")
    with session_scope() as s:
        st_ = review_stats(s)
        business = get_setting(s, "business_name", "")
    c = st.columns(4)
    c[0].metric("口コミ数", f"{st_.count}件")
    c[1].metric("平均評価", "—" if st_.average is None else f"★ {st_.average:.2f}")
    c[2].metric("未返信", f"{st_.unreplied}件", help=f"うち評価3以下：{st_.low_unreplied}件")
    c[3].metric("直近30日の口コミ", f"{st_.last_30d}件")

    with st.expander("✍️ 口コミを記録する", expanded=st_.count == 0):
        st.caption("Googleマップなどに届いた口コミを転記します（自動取得はしません）。")
        with st.form("new_review", clear_on_submit=True):
            cols = st.columns(3)
            pf = cols[0].selectbox("サービス", list(PLATFORMS), format_func=PLATFORMS.get)
            d = cols[1].date_input("日付", value=date.today())
            rating = cols[2].selectbox("評価", [5, 4, 3, 2, 1], format_func=lambda r: "★" * r)
            text = st.text_area("口コミの本文")
            if st.form_submit_button("記録する", type="primary"):
                with session_scope() as s:
                    add_review(s, pf, d, int(rating), text)
                flash("記録しました。")
                st.rerun()
    b = st.text_input("店舗・事業名（返信文に使います）", value=business)
    if b != business:
        with session_scope() as s:
            set_setting(s, "business_name", b)

    st.markdown("### 未返信の口コミ")
    ai_mode_caption()
    with session_scope() as s:
        pending = [(r.id, r.platform, r.review_date, r.rating, r.text, r.reply_draft, r.is_sample) for r in s.scalars(select(Review).where(Review.replied.is_(False)).order_by(Review.rating, Review.review_date.desc()))]
        done = [(r.review_date, r.rating, r.text, r.reply_draft, r.replied_at) for r in s.scalars(select(Review).where(Review.replied.is_(True)).order_by(Review.replied_at.desc()).limit(20))]
    if not pending:
        st.success("未返信の口コミはありません。")
    for rid, pf, d, rating, text, draft, sample in pending:
        with st.container(border=True):
            st.markdown(f"{'🧪サンプル ' if sample else ''}**{'★' * rating}{'☆' * (5 - rating)}**　{PLATFORMS.get(pf, pf)}・{d:%m/%d}")
            st.text(text or "（本文なし）")
            if st.button("🤖 返信の下書きを作る", key=f"rr_{rid}"):
                with session_scope() as s:
                    res = review_reply(s, rating, text, b)
                    s.get(Review, rid).reply_draft = res.data.get("reply", "")
                show_ai_result(res)
                st.rerun()
            reply = st.text_area("返信文（サービス上で返信したあと、実際に送った内容を残して「返信済み」にします）", value=draft, key=f"rt_{rid}")
            if st.button("返信済みにする", key=f"rd_{rid}", type="primary"):
                try:
                    with session_scope() as s:
                        mark_replied(s, s.get(Review, rid), reply)
                except ValueError as e:
                    st.error(str(e))
                else:
                    flash("返信済みにしました。")
                    st.rerun()

    with st.expander("📏 口コミ対策のルール"):
        for r in RULES:
            st.markdown(f"- {r}")
    if done:
        with st.expander(f"返信済み（直近{len(done)}件）"):
            for d, rating, text, reply, at in done:
                st.markdown(f"**{'★' * rating}** {d:%m/%d}　{text[:60]}  \n↳ {reply[:80]}（{fmt_dt(at)}）")
