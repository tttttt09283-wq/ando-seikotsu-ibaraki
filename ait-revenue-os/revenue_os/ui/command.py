"""全画面の上部に出す「チャドに頼む」入力欄。"""

from __future__ import annotations

import streamlit as st

from ..commands import EXAMPLES, run_command
from ..db import session_scope
from .nav import link


def _run(text: str) -> None:
    with st.spinner("チャドが作業中…"):
        with session_scope() as s:
            st.session_state["cmd_result"] = run_command(s, text)


def render_command_bar() -> None:
    with st.container(border=True):
        with st.form("chad_cmd", clear_on_submit=True, border=False):
            c = st.columns([6, 1])
            text = c[0].text_input("🧭 チャドに頼む", placeholder="例：数字を最新にして ／ Threadsの投稿を3本作って ／ おまかせでまとめてやって", label_visibility="collapsed")
            sent = c[1].form_submit_button("頼む", type="primary", use_container_width=True)
        if sent:
            _run(text)
        chips = st.columns(len(EXAMPLES[:5]))
        for col, ex in zip(chips, EXAMPLES[:5], strict=True):
            if col.button(ex, key=f"chip_{ex}", use_container_width=True):
                _run(ex)
        res = st.session_state.get("cmd_result")
        if res:
            (st.success if res.ok else st.warning)(f"🧭 {res.title}")
            for line in res.lines:
                if line:
                    st.markdown(line)
            if res.links:
                lc = st.columns(len(res.links) + 2)
                for col, (key, label) in zip(lc, res.links, strict=False):
                    link(key, f"{label} →", col)
                if lc[-1].button("閉じる", key="cmd_close"):
                    st.session_state.pop("cmd_result", None)
                    st.rerun()
