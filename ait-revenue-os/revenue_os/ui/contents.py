"""5. コンテンツ管理 と 6. 承認キュー"""

from __future__ import annotations


import pandas as pd
import streamlit as st
from sqlalchemy import select

from ..ai.generators import quality_review, sns_drafts
from ..db import session_scope
from ..models import (
    CHANNELS,
    CONTENT_STATUSES,
    STATUS_APPROVED,
    STATUS_DRAFT,
    STATUS_PUBLISHED,
    STATUS_REJECTED,
    STATUS_REVIEW,
    Content,
    NoteProduct,
    RakutenItem,
)
from ..quality import SEVERITY_ERROR, check_content, checklist_for, x_weighted_length
from ..workflow import (
    HUMAN_ACTOR,
    WorkflowError,
    approve,
    create_content,
    edit_content,
    mark_published,
    reject,
    reopen,
    send_back,
    submit_for_review,
)
from .common import ai_mode_caption, channel_label, flash, fmt_dt, sample_badge, show_ai_result, show_flash, status_label


def _findings_view(channel: str, title: str, body: str, linked_rakuten: bool) -> bool:
    findings = check_content(channel, title, body, linked_rakuten)
    if not findings:
        st.success("✅ ルールチェック：指摘なし")
        return False
    for f in findings:
        (st.error if f.severity == SEVERITY_ERROR else st.warning)(f"{f.severity}：{f.message}")
    return any(f.severity == SEVERITY_ERROR for f in findings)


def _content_table(status_filter: list[str], channel_filter: list[str]) -> list[dict]:
    with session_scope() as s:
        q = select(Content).order_by(Content.id.desc())
        if status_filter:
            q = q.where(Content.status.in_(status_filter))
        if channel_filter:
            q = q.where(Content.channel.in_(channel_filter))
        return [
            {
                "ID": c.id,
                "": sample_badge(c.is_sample) + ("🤖" if c.ai_generated else ""),
                "投稿先": channel_label(c.channel),
                "タイトル・冒頭": (c.title or c.body.replace("\n", " "))[:40],
                "状態": status_label(c.status),
                "更新": fmt_dt(c.updated_at),
            }
            for c in s.scalars(q).all()
        ]


def render_contents() -> None:
    st.title("✍️ コンテンツ管理")
    st.caption("Threads・X・note の下書きを作成・編集します。編集できるのは「下書き」の間だけで、保存のたびに修正履歴が残ります。")
    show_flash()

    c1, c2 = st.columns(2)
    sf = c1.multiselect("状態で絞り込み", CONTENT_STATUSES, format_func=status_label)
    cf = c2.multiselect("投稿先で絞り込み", CHANNELS, format_func=channel_label)
    rows = _content_table(sf, cf)
    if rows:
        st.dataframe(pd.DataFrame(rows), hide_index=True, width="stretch")
    st.caption("🤖＝AI（またはテンプレート）が作成したもの")

    tab_edit, tab_new, tab_ai = st.tabs(["✏️ 編集・履歴", "➕ 手動で作成", "🤖 マーケティングAIで作成"])

    with tab_new:
        with st.form("new_content", clear_on_submit=True):
            ch = st.selectbox("投稿先", CHANNELS, format_func=channel_label)
            title = st.text_input("タイトル（note のみ）")
            body = st.text_area("本文 *", height=200)
            if st.form_submit_button("下書きとして保存"):
                if not body.strip():
                    st.error("本文を入力してください。")
                else:
                    with session_scope() as s:
                        create_content(s, ch, title, body, actor=HUMAN_ACTOR)
                    flash("下書きを作成しました。")
                    st.rerun()

    with tab_ai:
        ai_mode_caption()
        with session_scope() as s:
            products = {p.id: p.title for p in s.scalars(select(NoteProduct))}
            items = {i.id: i.name for i in s.scalars(select(RakutenItem))}
        kind = st.radio("紹介するもの", ["note商品", "楽天商品", "自由入力"], horizontal=True)
        pid = iid = None
        if kind == "note商品" and products:
            pid = st.selectbox("note商品", list(products), format_func=products.get)
        elif kind == "楽天商品" and items:
            iid = st.selectbox("楽天商品", list(items), format_func=items.get)
        subject = st.text_input("テーマ・紹介する内容", value=products.get(pid) or items.get(iid) or "")
        details = st.text_area("補足（伝えたいこと・読者の悩みなど）")
        chans = st.multiselect("投稿先", CHANNELS, default=["threads", "x"], format_func=channel_label)
        if st.button("下書きを作る", disabled=not (subject.strip() and chans)):
            with session_scope() as s:
                res = sns_drafts(s, subject, details, chans, affiliate=iid is not None)
                for d in res.data.get("drafts", []):
                    create_content(s, d["channel"], d.get("title", ""), d["body"], actor="マーケティングAI", ai_generated=True, note_product_id=pid, rakuten_item_id=iid)
                n = len(res.data.get("drafts", []))
            flash(f"{n}件の下書きを作成しました（{res.label}）。{res.notice} 内容を確認・修正してからレビューに出してください。", "info")
            st.rerun()

    with tab_edit:
        if not rows:
            st.info("コンテンツがまだありません。")
            return
        cid = st.selectbox("コンテンツを選ぶ", [r["ID"] for r in rows], format_func=lambda i: next(f"#{i} {r['']}[{r['状態']}] {r['投稿先']}：{r['タイトル・冒頭']}" for r in rows if r["ID"] == i))
        with session_scope() as s:
            c = s.get(Content, cid)
            st.markdown(f"**状態：{status_label(c.status)}**" + (f"　公開URL：{c.public_url}" if c.public_url else ""))
            editable = c.status == STATUS_DRAFT
            with st.form(f"edit_{cid}"):
                ch = st.selectbox("投稿先", CHANNELS, index=CHANNELS.index(c.channel), format_func=channel_label, disabled=not editable)
                title = st.text_input("タイトル", value=c.title, disabled=not editable)
                body = st.text_area("本文", value=c.body, height=260, disabled=not editable)
                note = st.text_input("修正メモ（任意）", disabled=not editable)
                if editable and st.form_submit_button("保存する"):
                    try:
                        c.channel = ch
                        edit_content(s, c, title, body, HUMAN_ACTOR, note)
                    except WorkflowError as e:
                        st.error(str(e))
                    else:
                        flash("保存しました（修正履歴に記録）。")
                        st.rerun()
                elif not editable:
                    st.form_submit_button("保存する（下書きのときだけ編集できます）", disabled=True)
            linked_rakuten = c.rakuten_item_id is not None
            st.caption(f"文字数：{len(c.body)}字" + (f"（X換算 {x_weighted_length(c.body)}／280）" if c.channel == "x" else ""))
            _findings_view(c.channel, c.title, c.body, linked_rakuten)
            snapshot = (c.channel, c.title, c.body, c.status)
            history = [(r.created_at, r.editor, r.note, r.title, r.body) for r in reversed(c.revisions)]
            events = [(e.created_at, e.actor, status_label(e.from_status), status_label(e.to_status), e.comment) for e in reversed(c.approval_events)]

        b1, b2 = st.columns(2)
        if snapshot[3] == STATUS_DRAFT and b1.button("📨 レビューに出す", type="primary"):
            with session_scope() as s:
                try:
                    submit_for_review(s, s.get(Content, cid), HUMAN_ACTOR)
                except WorkflowError as e:
                    st.error(str(e))
                else:
                    flash("レビュー待ちにしました。「承認キュー」で確認できます。")
                    st.rerun()
        if b2.button("🛡️ 品質管理AIでチェック"):
            with session_scope() as s:
                res = quality_review(s, snapshot[0], snapshot[1], snapshot[2])
            show_ai_result(res)
            st.write(res.data.get("summary", ""))
            for i in res.data.get("issues", []):
                (st.error if i["severity"] == SEVERITY_ERROR else st.warning)(f"{i['severity']}：{i['message']}")

        with st.expander(f"🕘 修正履歴（{len(history)}件）"):
            for at, editor, note, t, b in history:
                st.markdown(f"**{fmt_dt(at)}　{editor}**　{note}")
                st.text(f"{t}\n{b}" if t else b)
                st.divider()
        with st.expander(f"📋 承認の記録（{len(events)}件）"):
            for at, actor, frm, to, comment in events:
                st.markdown(f"- {fmt_dt(at)}　**{actor}**：{frm} → {to}　{comment}")


def render_approvals() -> None:
    st.title("✅ 承認キュー")
    st.warning(
        "「承認」しても、このアプリが外部サービスに投稿・公開することはありません。"
        "承認後に社長が各サービスで手作業で公開し、その公開URLを入力して「公開済み」と記録します。"
    )
    show_flash()

    with session_scope() as s:
        counts = {st_: len(s.scalars(select(Content.id).where(Content.status == st_)).all()) for st_ in CONTENT_STATUSES}
    tabs = st.tabs([f"{status_label(x)}（{counts[x]}）" for x in (STATUS_REVIEW, STATUS_APPROVED, STATUS_DRAFT, STATUS_PUBLISHED, STATUS_REJECTED)])
    order = (STATUS_REVIEW, STATUS_APPROVED, STATUS_DRAFT, STATUS_PUBLISHED, STATUS_REJECTED)

    for tab, status in zip(tabs, order, strict=True):
        with tab:
            with session_scope() as s:
                items = [
                    (c.id, c.channel, c.title, c.body, c.is_sample, c.ai_generated, c.rakuten_item_id is not None, c.note_product_id is not None, c.public_url, c.published_at)
                    for c in s.scalars(select(Content).where(Content.status == status).order_by(Content.id))
                ]
            if not items:
                st.caption("該当するコンテンツはありません。")
            for cid, ch, title, body, is_sample, ai_gen, linked_r, linked_n, url, pub_at in items:
                with st.container(border=True):
                    st.markdown(f"**#{cid} {sample_badge(is_sample)}{'🤖 ' if ai_gen else ''}{channel_label(ch)}**　{title}")
                    st.text(body)
                    if status == STATUS_REVIEW:
                        blocking = _findings_view(ch, title, body, linked_r)
                        st.markdown("**公開前チェックリスト**（すべて確認してから承認）")
                        checked = {key: st.checkbox(label, key=f"chk_{cid}_{key}") for key, label in checklist_for(ch, body, linked_r, linked_n)}
                        comment = st.text_input("コメント（却下・差し戻しは必須）", key=f"cmt_{cid}")
                        a, r, b = st.columns(3)
                        if a.button("承認する", key=f"ap_{cid}", type="primary", disabled=blocking):
                            _act(lambda s, c: approve(s, c, HUMAN_ACTOR, checked, comment), cid, "承認しました（まだ公開されていません）。")
                        if r.button("却下する", key=f"rj_{cid}"):
                            _act(lambda s, c: reject(s, c, HUMAN_ACTOR, comment), cid, "却下しました。")
                        if b.button("差し戻す（下書きへ）", key=f"sb_{cid}"):
                            _act(lambda s, c: send_back(s, c, HUMAN_ACTOR, comment), cid, "下書きに差し戻しました。")
                    elif status == STATUS_APPROVED:
                        st.markdown("**公開の記録**：各サービスで公開したら、その記事・投稿のURLを入力してください。")
                        url_in = st.text_input("公開URL", key=f"url_{cid}", placeholder="https://")
                        p, b = st.columns(2)
                        if p.button("公開済みとして記録", key=f"pub_{cid}", type="primary"):
                            _act(lambda s, c: mark_published(s, c, HUMAN_ACTOR, url_in), cid, "公開済みとして記録しました。")
                        comment = st.text_input("差し戻し理由", key=f"sbc_{cid}")
                        if b.button("修正のため下書きへ戻す", key=f"sb2_{cid}"):
                            _act(lambda s, c: send_back(s, c, HUMAN_ACTOR, comment), cid, "下書きに戻しました。")
                    elif status == STATUS_PUBLISHED:
                        st.markdown(f"公開URL：{url}　（{fmt_dt(pub_at)}）")
                    elif status == STATUS_REJECTED:
                        if st.button("作り直す（下書きへ）", key=f"ro_{cid}"):
                            _act(lambda s, c: reopen(s, c, HUMAN_ACTOR), cid, "下書きに戻しました。")
                    elif status == STATUS_DRAFT:
                        st.caption("「コンテンツ管理」で編集し、レビューに出してください。")


def _act(fn, cid: int, ok_msg: str) -> None:
    try:
        with session_scope() as s:
            fn(s, s.get(Content, cid))
    except WorkflowError as e:
        st.error(str(e))
    else:
        flash(ok_msg)
        st.rerun()
