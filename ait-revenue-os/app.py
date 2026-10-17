"""A.I.T Revenue OS — 起動： streamlit run app.py"""

from __future__ import annotations

import streamlit as st

from revenue_os.config import get_settings
from revenue_os.db import init_db, session_scope
from revenue_os.seed import delete_sample, has_sample, seed_sample
from revenue_os.ui import chad, contents, dashboard, departments, funnel, importer, nav, products, research, threads, today

st.set_page_config(page_title="A.I.T Revenue OS", page_icon="📈", layout="wide")


@st.cache_resource
def _init() -> bool:
    init_db()
    return True


_init()
settings = get_settings()

with st.sidebar:
    st.markdown("## A.I.T Revenue OS")
    st.caption("自由に、自分たちが楽しい。")
    if settings.ai_enabled:
        st.success(f"AI：有効（{settings.model}）")
    else:
        st.info("AI：テンプレートモード\n（.env にAPIキーを設定すると有効）")
    if settings.threads_connected and settings.threads_posting_enabled:
        st.caption("🧵 Threads：承認・予約した投稿だけを公式APIで投稿します。それ以外の外部サービスへの投稿・販売設定の変更は行いません。")
    else:
        st.caption("🔒 外部サービスへの投稿・販売設定の変更は行いません（Threads の予約投稿はオフ）。")

    with session_scope() as s:
        sample_exists = has_sample(s)
    st.toggle("サンプルデータを集計に含める", value=True, key="include_sample", disabled=not sample_exists)
    with st.expander("サンプルデータ"):
        if sample_exists:
            st.caption("🧪 の付いたデータはサンプル（架空）です。本番運用を始める前に削除してください。")
            if st.button("サンプルを削除"):
                with session_scope() as s:
                    delete_sample(s)
                st.rerun()
        else:
            if st.button("サンプルを投入"):
                with session_scope() as s:
                    seed_sample(s)
                st.rerun()

PAGE_DEFS = [
    ("today", today.render, "今日やること", "✅"),
    ("dashboard", dashboard.render, "経営ダッシュボード", "📊"),
    ("departments", departments.render, "部門ボード", "🏢"),
    ("threads", threads.render, "Threads運用", "🧵"),
    ("funnel", funnel.render, "note導線", "🛤"),
    ("research", research.render, "市場調査", "🔎"),
    ("note", products.render_note, "note商品管理", "📘"),
    ("rakuten", products.render_rakuten, "楽天商品管理", "🛒"),
    ("contents", contents.render_contents, "コンテンツ管理", "✍️"),
    ("approvals", contents.render_approvals, "承認キュー", "🗳"),
    ("import", importer.render, "売上CSVインポート", "📥"),
    ("chad", chad.render, "チャド日次報告", "🧭"),
]
nav.PAGES.clear()
for i, (key, fn, title, icon) in enumerate(PAGE_DEFS):
    nav.PAGES[key] = st.Page(fn, title=title, icon=icon, url_path=key, default=i == 0)
st.navigation(list(nav.PAGES.values())).run()
