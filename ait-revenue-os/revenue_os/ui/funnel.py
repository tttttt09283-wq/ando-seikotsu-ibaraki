"""note導線：Threads → プロフィール → note 無料部分 → 購入 の流れを商品ごとに点検する。"""

from __future__ import annotations

import streamlit as st

from ..ai.generators import funnel_improvement
from ..db import session_scope
from ..threads_analytics import funnel_rows, set_funnel_check, views_vs_sales
from ..workflow import create_content
from .common import ai_mode_caption, flash, show_ai_result, show_flash
from .nav import link


def render() -> None:
    st.title("🛤 note導線")
    st.caption("Threads で知ってもらう → プロフィール → note 無料部分 → 購入。商品ごとに導線の抜けを点検し、AIが改善案を出します。")
    show_flash()

    with session_scope() as s:
        rows = funnel_rows(s)
        chart = views_vs_sales(s)
    if not rows:
        st.info("note 商品がまだありません。")
        link("note", "→ note商品管理で商品をつくる")
        return

    st.markdown("#### 日別：Threads の閲覧数と note の販売件数（30日）")
    st.caption("投稿した日の閲覧数と、その日の販売件数です。関係の目安であり、どの投稿から売れたかを示すものではありません。")
    c1, c2 = st.columns(2)
    c1.bar_chart(chart["Threads閲覧数"], y_label="閲覧数")
    c2.bar_chart(chart["note販売件数"], y_label="件数", color="#2e7d32")

    for f in rows:
        with st.container(border=True):
            st.markdown(f"### {f.title}")
            m = st.columns(5)
            m[0].metric("導線スコア", f"{f.score}点")
            m[1].metric("紐付いた投稿（7日）", f"{f.posts_7d}本")
            m[2].metric("閲覧数（30日）", f"{f.views_30d:,}")
            m[3].metric("販売（30日）", f"{f.sales_30d}件", help="note の売上CSVで、商品名が一致するもの")
            m[4].metric("1万閲覧あたり販売", "—" if f.sales_per_10k_views is None else f"{f.sales_per_10k_views:.1f}件")
            st.progress(f.score / 100)
            for key, label, ok, auto in f.checks:
                if auto:
                    st.markdown(f"{'✅' if ok else '⬜'} {label}　<small>（自動判定）</small>", unsafe_allow_html=True)
                else:
                    v = st.checkbox(label, value=ok, key=f"fc_{f.product_id}_{key}")
                    if v != ok:
                        with session_scope() as s:
                            set_funnel_check(s, f.product_id, key, v)
                        st.rerun()
            ai_mode_caption()
            if st.button("🤝 営業AIに導線の改善案を出してもらう", key=f"fa_{f.product_id}"):
                with session_scope() as s:
                    res = funnel_improvement(
                        s,
                        {
                            "title": f.title,
                            "price_yen": f.price_yen,
                            "status": f.status,
                            "posts_7d": f.posts_7d,
                            "views_30d": f.views_30d,
                            "sales_30d": f.sales_30d,
                            "checks": [{"label": label, "ok": ok} for _, label, ok, _ in f.checks],
                        },
                    )
                st.session_state[f"funnel_ai_{f.product_id}"] = (res.data, res.label, res.notice, res.mode)
                show_ai_result(res)
            saved = st.session_state.get(f"funnel_ai_{f.product_id}")
            if saved:
                data = saved[0]
                st.markdown("**詰まっている箇所（仮説）**")
                for b in data.get("bottlenecks", []):
                    st.markdown(f"- {b}")
                st.markdown("**今日からできること**")
                for a in data.get("actions", []):
                    st.markdown(f"- {a}")
                st.markdown("**プロフィール文案**（Threads アプリで手動で設定してください）")
                st.code(data.get("profile_text", ""), language=None)
                st.markdown("**固定投稿の文案**")
                st.text(data.get("pinned_post", ""))
                if st.button("固定投稿を Threads の下書きとして保存", key=f"pin_{f.product_id}"):
                    with session_scope() as s:
                        create_content(s, "threads", "", data.get("pinned_post", ""), actor="営業AI", ai_generated=True, note_product_id=f.product_id)
                    flash("下書きとして保存しました。承認・予約したあと、Threads アプリで固定してください。")
                    st.rerun()
