"""画面共通の部品。"""

from __future__ import annotations

from datetime import date, datetime, time

import streamlit as st

from ..ai.client import AIResult
from ..config import get_settings
from ..models import CHANNEL_LABELS, STATUS_LABELS


def include_sample() -> bool:
    return bool(st.session_state.get("include_sample", True))


def sample_badge(is_sample: bool) -> str:
    return "🧪サンプル " if is_sample else ""


def status_label(status: str) -> str:
    return STATUS_LABELS.get(status, status)


def channel_label(ch: str) -> str:
    return CHANNEL_LABELS.get(ch, ch)


def show_ai_result(result: AIResult) -> None:
    if result.mode == "api":
        st.success(f"🤖 {result.label}：{result.notice}")
    else:
        st.info(f"📝 {result.label}：{result.notice}")


def ai_mode_caption() -> None:
    s = get_settings()
    if s.ai_enabled:
        st.caption(f"🤖 AI生成：有効（{s.model}／1日の上限 ¥{s.ai_daily_budget_yen}）。生成物はすべて「下書き・仮説」として保存され、公開には承認が必要です。")
    else:
        st.caption("📝 AI生成：テンプレートモード（APIキー未設定）。たたき台をテンプレートで作ります。")


def datetime_input(label: str, value: datetime | None, key: str) -> datetime | None:
    """確認日時の入力（未確認の場合は空のまま）。"""
    cols = st.columns([1, 1, 1])
    unknown = cols[0].checkbox(f"{label}：未確認", value=value is None, key=f"{key}_unknown")
    if unknown:
        return None
    v = value or datetime.now()
    d = cols[1].date_input(f"{label}（日付）", value=v.date(), key=f"{key}_d")
    t = cols[2].time_input(f"{label}（時刻）", value=v.time().replace(second=0, microsecond=0), key=f"{key}_t")
    return datetime.combine(d, t or time())


def fmt_dt(v: datetime | date | None) -> str:
    if v is None:
        return "未確認"
    if isinstance(v, datetime):
        return v.strftime("%Y/%m/%d %H:%M")
    return v.strftime("%Y/%m/%d")


def flash(msg: str, kind: str = "success") -> None:
    """画面の再描画後に一度だけ表示するメッセージ。"""
    st.session_state["_flash"] = (kind, msg)


def show_flash() -> None:
    item = st.session_state.pop("_flash", None)
    if item:
        kind, msg = item
        getattr(st, kind)(msg)
