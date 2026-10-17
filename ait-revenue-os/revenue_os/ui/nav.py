"""画面同士のリンク。app.py が起動時に各画面を登録する。"""

from __future__ import annotations

import streamlit as st

PAGES: dict = {}
PAGE_TITLES = {
    "today": "今日やること",
    "hub": "集客ハブ",
    "search": "検索対策",
    "reviews": "口コミ対策",
    "dashboard": "経営ダッシュボード",
    "departments": "部門ボード",
    "threads": "Threads運用",
    "funnel": "note導線",
    "research": "市場調査",
    "note": "note商品管理",
    "rakuten": "楽天商品管理",
    "contents": "コンテンツ管理",
    "approvals": "承認キュー",
    "import": "売上CSVインポート",
    "chad": "チャド日次報告",
}


def link(key: str, label: str | None = None, container=st) -> None:
    label = label or f"→ {PAGE_TITLES.get(key, key)}を開く"
    page = PAGES.get(key)
    if page is not None:
        container.page_link(page, label=label)
    else:
        container.caption(label)
