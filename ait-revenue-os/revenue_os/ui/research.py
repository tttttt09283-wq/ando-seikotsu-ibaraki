"""2. 市場調査"""

from __future__ import annotations

import streamlit as st
from sqlalchemy import select

from ..ai.generators import research_hypotheses
from ..db import session_scope
from ..models import VERIFICATION_STATUSES, ResearchSource, ResearchTheme
from ..workflow import WorkflowError, validate_public_url
from .common import ai_mode_caption, datetime_input, flash, fmt_dt, sample_badge, show_ai_result, show_flash


def render() -> None:
    st.title("🔎 市場調査")
    st.caption("AIが出すのは「仮説」です。人間が出典（URL）で確認できたことだけを「確認済みの事実」に書いてください。")
    show_flash()

    with st.expander("➕ 新しいテーマを登録", expanded=False):
        with st.form("new_theme", clear_on_submit=True):
            title = st.text_input("テーマ *")
            target = st.text_input("想定読者")
            problem = st.text_area("読者の課題")
            if st.form_submit_button("登録する"):
                if not title.strip():
                    st.error("テーマを入力してください。")
                else:
                    with session_scope() as s:
                        s.add(ResearchTheme(title=title.strip(), target_reader=target, problem=problem))
                    flash("テーマを登録しました。")
                    st.rerun()

    with session_scope() as s:
        themes = s.scalars(select(ResearchTheme).order_by(ResearchTheme.id.desc())).all()
        if not themes:
            st.info("まだテーマがありません。上の「新しいテーマを登録」から追加してください。")
            return
        labels = {t.id: f"{sample_badge(t.is_sample)}[{t.verification_status}] {t.title}" for t in themes}
    theme_id = st.selectbox("テーマを選ぶ", list(labels), format_func=labels.get)

    with session_scope() as s:
        t = s.get(ResearchTheme, theme_id)
        sources = [(src.id, src.url, src.title, src.note, src.checked_at) for src in t.sources]
        with st.form(f"theme_{t.id}"):
            title = st.text_input("テーマ", value=t.title)
            target = st.text_input("想定読者", value=t.target_reader)
            problem = st.text_area("読者の課題", value=t.problem)
            competitor = st.text_area("競合調査メモ", value=t.competitor_notes, help="人間が実際に見て確認した内容を書きます。")
            c1, c2 = st.columns(2)
            hypothesis = c1.text_area("🟡 仮説（AI・推測／未確認）", value=t.hypothesis, height=200)
            facts = c2.text_area("🟢 確認済みの事実（出典あり）", value=t.verified_facts, height=200, help="下の出典で確認できた内容だけを書きます。")
            status = st.selectbox("検証状態", VERIFICATION_STATUSES, index=VERIFICATION_STATUSES.index(t.verification_status))
            if st.form_submit_button("保存する"):
                if status == "確認済み" and not sources:
                    st.error("「確認済み」にするには、出典を1件以上登録してください。")
                else:
                    t.title, t.target_reader, t.problem, t.competitor_notes = title, target, problem, competitor
                    t.hypothesis, t.verified_facts, t.verification_status = hypothesis, facts, status
                    flash("保存しました。")
                    st.rerun()

    st.subheader("出典URL")
    if sources:
        for sid, url, stitle, note, checked in sources:
            cols = st.columns([6, 2, 1])
            cols[0].markdown(f"[{stitle or url}]({url})  \n{note}")
            cols[1].caption(f"確認：{fmt_dt(checked)}")
            if cols[2].button("削除", key=f"del_src_{sid}"):
                with session_scope() as s:
                    s.delete(s.get(ResearchSource, sid))
                st.rerun()
    else:
        st.caption("出典はまだありません。")
    with st.form(f"add_src_{theme_id}", clear_on_submit=True):
        st.markdown("**出典を追加**（自分で開いて内容を確認したページだけ）")
        url = st.text_input("URL *")
        stitle = st.text_input("ページ名")
        note = st.text_input("確認した内容のメモ")
        checked = datetime_input("確認日時", None, f"src_{theme_id}")
        if st.form_submit_button("追加する"):
            try:
                url = validate_public_url(url)
            except WorkflowError as e:
                st.error(str(e).replace("公開URL", "出典URL"))
            else:
                with session_scope() as s:
                    s.add(ResearchSource(theme_id=theme_id, url=url, title=stitle, note=note, checked_at=checked))
                flash("出典を追加しました。")
                st.rerun()

    st.subheader("🔎 市場調査AI")
    ai_mode_caption()
    if st.button("需要の仮説と確認すべき問いを出す"):
        with session_scope() as s:
            t = s.get(ResearchTheme, theme_id)
            res = research_hypotheses(s, t.title, t.target_reader, t.problem)
            add = "\n".join(res.data.get("hypotheses", []))
            t.hypothesis = (t.hypothesis + "\n" if t.hypothesis else "") + f"――{res.label}――\n{add}"
        show_ai_result(res)
        st.markdown("**仮説（「仮説」欄に追記しました）**")
        for h in res.data.get("hypotheses", []):
            st.markdown(f"- {h}")
        st.markdown("**確認すべき問い**")
        for q in res.data.get("verify_questions", []):
            st.markdown(f"- {q}")
        st.markdown("**人間が調べるための検索キーワード**")
        st.write("、".join(res.data.get("search_keywords", [])))
