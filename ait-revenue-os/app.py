"""A.I.T Revenue OS — 起動： streamlit run app.py"""

from __future__ import annotations

import streamlit as st

from revenue_os.config import get_settings
from revenue_os.db import init_db, session_scope
from revenue_os.seed import delete_sample, has_sample, seed_sample
from revenue_os.ui import chad, contents, dashboard, departments, importer, products, research

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
    st.caption("🔒 外部サービスへの投稿・販売設定の変更は一切行いません。")

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

pages = [
    st.Page(dashboard.render, title="経営ダッシュボード", icon="📊", url_path="dashboard", default=True),
    st.Page(departments.render, title="部門ボード", icon="🏢", url_path="departments"),
    st.Page(research.render, title="市場調査", icon="🔎", url_path="research"),
    st.Page(products.render_note, title="note商品管理", icon="📘", url_path="note"),
    st.Page(products.render_rakuten, title="楽天商品管理", icon="🛒", url_path="rakuten"),
    st.Page(contents.render_contents, title="コンテンツ管理", icon="✍️", url_path="contents"),
    st.Page(contents.render_approvals, title="承認キュー", icon="✅", url_path="approvals"),
    st.Page(importer.render, title="売上CSVインポート", icon="📥", url_path="import"),
    st.Page(chad.render, title="チャド日次報告", icon="🧭", url_path="chad"),
]
st.navigation(pages).run()
