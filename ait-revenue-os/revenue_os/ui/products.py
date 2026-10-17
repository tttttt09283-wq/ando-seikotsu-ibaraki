"""3. note商品管理 と 4. 楽天商品管理"""

from __future__ import annotations

from datetime import datetime, timedelta

import pandas as pd
import streamlit as st
from sqlalchemy import select

from ..ai.generators import note_product_plan, rakuten_evaluation, sales_cta
from ..db import session_scope
from ..models import PRODUCT_STATUSES, RAKUTEN_STATUSES, NoteProduct, RakutenItem, ResearchTheme
from ..workflow import HUMAN_ACTOR, WorkflowError, create_content, validate_public_url
from .common import ai_mode_caption, datetime_input, flash, fmt_dt, sample_badge, show_ai_result, show_flash

# ---------------------------------------------------------------------------
# note
# ---------------------------------------------------------------------------


def render_note() -> None:
    st.title("📘 note商品管理")
    st.caption("商品の企画・原稿を管理します。note での公開・価格設定は社長が note 上で行い、公開URLをここに記録します。")
    show_flash()

    with session_scope() as s:
        themes = {t.id: t.title for t in s.scalars(select(ResearchTheme).order_by(ResearchTheme.id.desc()))}
        products = s.scalars(select(NoteProduct).order_by(NoteProduct.id.desc())).all()
        rows = [{"ID": p.id, "": sample_badge(p.is_sample), "商品名": p.title, "価格（円）": p.price_yen, "状態": p.status, "公開URL": p.public_url or "未公開"} for p in products]
    if rows:
        st.dataframe(pd.DataFrame(rows), hide_index=True, width="stretch")

    tab_new, tab_edit = st.tabs(["➕ 新規作成", "✏️ 編集・AI"])
    with tab_new:
        ai_mode_caption()
        theme_id = st.selectbox("元にする調査テーマ（任意）", [None, *themes], format_func=lambda i: "（なし）" if i is None else themes[i])
        if theme_id and st.button("商品開発AIで企画のたたき台を作る"):
            with session_scope() as s:
                t = s.get(ResearchTheme, theme_id)
                res = note_product_plan(s, t.title, t.target_reader, t.problem, t.verified_facts)
                d = res.data
                p = NoteProduct(
                    theme_id=theme_id,
                    title=d["title"],
                    concept=d["concept"] + f"\n\n【価格の仮説】{d['price_hypothesis']}",
                    free_article=d["free_outline"],
                    paid_article=d["paid_outline"],
                    sales_funnel=d["funnel"],
                    cta=d["cta"],
                )
                s.add(p)
            show_ai_result(res)
            flash(f"「{d['title']}」を企画中として作成しました。「編集・AI」タブで確認してください。（{res.label}）")
            st.rerun()
        with st.form("new_note", clear_on_submit=True):
            title = st.text_input("商品名 *")
            price = st.number_input("価格（円）", min_value=0, step=10)
            if st.form_submit_button("空の商品を作成"):
                if not title.strip():
                    st.error("商品名を入力してください。")
                else:
                    with session_scope() as s:
                        s.add(NoteProduct(title=title.strip(), price_yen=int(price), theme_id=theme_id))
                    flash("作成しました。")
                    st.rerun()

    with tab_edit:
        if not rows:
            st.info("商品がまだありません。")
            return
        pid = st.selectbox("商品を選ぶ", [r["ID"] for r in rows], format_func=lambda i: next(f"{r['']}{r['商品名']}" for r in rows if r["ID"] == i))
        with session_scope() as s:
            p = s.get(NoteProduct, pid)
            with st.form(f"note_{pid}"):
                title = st.text_input("商品名", value=p.title)
                concept = st.text_area("商品企画（コンセプト）", value=p.concept, height=120)
                free = st.text_area("無料記事（無料部分）", value=p.free_article, height=200)
                paid = st.text_area("有料記事（有料部分）", value=p.paid_article, height=250)
                c = st.columns(2)
                price = c[0].number_input("価格（円）", min_value=0, step=10, value=p.price_yen)
                status = c[1].selectbox("状態", PRODUCT_STATUSES, index=PRODUCT_STATUSES.index(p.status))
                funnel = st.text_area("販売導線", value=p.sales_funnel)
                cta = st.text_area("CTA（行動の呼びかけ）", value=p.cta)
                url = st.text_input("公開URL（note で公開した後に入力）", value=p.public_url)
                if st.form_submit_button("保存する"):
                    try:
                        url = validate_public_url(url) if url.strip() else ""
                        if status == "販売中" and not url:
                            raise WorkflowError("「販売中」にするには、note で公開した記事の公開URLを入力してください。")
                    except WorkflowError as e:
                        st.error(str(e))
                    else:
                        p.title, p.concept, p.free_article, p.paid_article = title, concept, free, paid
                        p.price_yen, p.status, p.sales_funnel, p.cta, p.public_url = int(price), status, funnel, cta, url
                        flash("保存しました。")
                        st.rerun()
            snapshot = {"title": p.title, "concept": p.concept, "price": p.price_yen, "free": p.free_article}

        c1, c2 = st.columns(2)
        if c1.button("💡 営業AIで販売導線・CTA案を出す"):
            with session_scope() as s:
                res = sales_cta(s, snapshot["title"], snapshot["concept"], snapshot["price"])
            show_ai_result(res)
            st.markdown("**販売導線（案）**")
            for x in res.data.get("funnel_steps", []):
                st.markdown(f"- {x}")
            st.markdown("**CTA（案）** ※必要なものを上の欄にコピーして使ってください")
            for x in res.data.get("ctas", []):
                st.markdown(f"- {x}")
        if c2.button("📝 この商品の note 記事を下書きとしてコンテンツ管理へ送る"):
            with session_scope() as s:
                body = f"{snapshot['free']}\n\n――――ここから有料――――\n\n（有料部分は商品管理の原稿を参照）"
                create_content(s, "note", snapshot["title"], body, actor=HUMAN_ACTOR, note_product_id=pid)
            flash("コンテンツ管理に下書きを作成しました。")
            st.rerun()


# ---------------------------------------------------------------------------
# 楽天
# ---------------------------------------------------------------------------


def render_rakuten() -> None:
    st.title("🛒 楽天商品管理")
    st.info(
        "**手動登録モード**：楽天の公式APIとの連携は、公式仕様と利用規約を確認してから追加します（現在は未実装）。"
        "商品情報・価格・報酬率は、楽天の画面で確認した内容を出典URLと確認日時つきで手入力してください。"
        "アフィリエイトリンクは楽天アフィリエイトの管理画面で取得したものを貼り付けます。"
    )
    show_flash()

    with session_scope() as s:
        items = s.scalars(select(RakutenItem).order_by(RakutenItem.id.desc())).all()
        stale_before = datetime.now() - timedelta(days=7)
        rows = [
            {
                "ID": i.id,
                "": sample_badge(i.is_sample),
                "商品名": i.name,
                "価格（円）": i.price_yen,
                "価格確認": fmt_dt(i.price_checked_at) + (" ⚠️要再確認" if not i.price_checked_at or i.price_checked_at < stale_before else ""),
                "報酬率": "未確認" if i.commission_rate_pct is None else f"{i.commission_rate_pct}%",
                "状態": i.status,
            }
            for i in items
        ]
    if rows:
        st.dataframe(pd.DataFrame(rows), hide_index=True, width="stretch")
        st.caption("⚠️ 価格の確認から7日以上たった商品は、掲載前に再確認してください。")

    tab_new, tab_edit = st.tabs(["➕ 商品候補を登録", "✏️ 編集・AI"])
    with tab_new:
        with st.form("new_rakuten", clear_on_submit=True):
            name = st.text_input("商品名 *")
            shop = st.text_input("ショップ名")
            item_url = st.text_input("商品ページURL *")
            if st.form_submit_button("登録する"):
                try:
                    if not name.strip():
                        raise WorkflowError("商品名を入力してください。")
                    item_url = validate_public_url(item_url).strip()
                except WorkflowError as e:
                    st.error(str(e).replace("公開URL", "商品ページURL"))
                else:
                    with session_scope() as s:
                        s.add(RakutenItem(name=name.strip(), shop_name=shop, item_url=item_url))
                    flash("登録しました。「編集・AI」タブで価格・出典・確認日時を入力してください。")
                    st.rerun()

    with tab_edit:
        if not rows:
            st.info("商品候補がまだありません。")
            return
        iid = st.selectbox("商品を選ぶ", [r["ID"] for r in rows], format_func=lambda i: next(f"{r['']}{r['商品名']}" for r in rows if r["ID"] == i))
        with session_scope() as s:
            it = s.get(RakutenItem, iid)
            with st.form(f"rakuten_{iid}"):
                name = st.text_input("商品名", value=it.name)
                shop = st.text_input("ショップ名", value=it.shop_name)
                item_url = st.text_input("商品ページURL", value=it.item_url)
                aff = st.text_input("アフィリエイトリンク（楽天アフィリエイト管理画面で取得）", value=it.affiliate_url)
                st.markdown("**価格**")
                price = st.number_input("価格（円）", min_value=0, step=1, value=it.price_yen or 0)
                price_src = st.text_input("価格の出典URL", value=it.price_source_url or it.item_url)
                price_at = datetime_input("価格の確認日時", it.price_checked_at, f"pa_{iid}")
                st.markdown("**報酬率**")
                rate_known = st.checkbox("報酬率を確認済み", value=it.commission_rate_pct is not None)
                rate = st.number_input("報酬率（%）", min_value=0.0, max_value=100.0, step=0.5, value=float(it.commission_rate_pct or 0))
                rate_src = st.text_input("報酬率の出典URL", value=it.commission_source_url)
                rate_at = datetime_input("報酬率の確認日時", it.commission_checked_at, f"ra_{iid}")
                st.markdown("**在庫**")
                stock = st.text_input("在庫状況", value=it.stock_note)
                stock_at = datetime_input("在庫の確認日時", it.stock_checked_at, f"sa_{iid}")
                intro = st.text_area("紹介文", value=it.intro_text, height=150)
                disclosure = st.text_input("広告表記", value=it.ad_disclosure)
                evaluation = st.text_area("評価メモ（仮説）", value=it.evaluation)
                status = st.selectbox("状態", RAKUTEN_STATUSES, index=RAKUTEN_STATUSES.index(it.status))
                if st.form_submit_button("保存する"):
                    errors = []
                    if price and (not price_src.strip() or price_at is None):
                        errors.append("価格を入力する場合は、出典URLと確認日時も入力してください。")
                    if rate_known and (not rate_src.strip() or rate_at is None):
                        errors.append("報酬率を入力する場合は、出典URLと確認日時も入力してください。")
                    if not disclosure.strip():
                        errors.append("広告表記は空にできません。")
                    for label, u in (("商品ページURL", item_url), ("アフィリエイトリンク", aff), ("価格の出典URL", price_src), ("報酬率の出典URL", rate_src)):
                        if u.strip():
                            try:
                                validate_public_url(u)
                            except WorkflowError:
                                errors.append(f"{label} が正しいURLではありません。")
                    if errors:
                        for e in errors:
                            st.error(e)
                    else:
                        it.name, it.shop_name, it.item_url, it.affiliate_url = name, shop, item_url, aff
                        it.price_yen = int(price) if price else None
                        it.price_source_url, it.price_checked_at = price_src, price_at if price else None
                        it.commission_rate_pct = float(rate) if rate_known else None
                        it.commission_source_url, it.commission_checked_at = rate_src, rate_at if rate_known else None
                        it.stock_note, it.stock_checked_at = stock, stock_at
                        it.intro_text, it.ad_disclosure, it.evaluation, it.status = intro, disclosure, evaluation, status
                        flash("保存しました。")
                        st.rerun()
            snapshot = {
                "name": it.name,
                "shop_name": it.shop_name,
                "price_yen": it.price_yen,
                "price_checked_at": fmt_dt(it.price_checked_at),
                "commission_rate_pct": it.commission_rate_pct,
                "stock_note": it.stock_note,
                "intro": it.intro_text,
                "disclosure": it.ad_disclosure,
            }

        ai_mode_caption()
        c1, c2 = st.columns(2)
        if c1.button("🧐 商品開発AIで評価・紹介文案を作る"):
            with session_scope() as s:
                res = rakuten_evaluation(s, snapshot)
                it = s.get(RakutenItem, iid)
                it.evaluation = (it.evaluation + "\n" if it.evaluation else "") + f"――{res.label}――\n" + "\n".join(
                    [*(f"・{x}" for x in res.data.get("fit_points", [])), *(f"・注意：{x}" for x in res.data.get("risks", []))]
                )
            show_ai_result(res)
            st.markdown("**紹介文案**（必要なら上の紹介文欄にコピーしてください）")
            st.code(res.data.get("intro_text", ""), language=None)
        if c2.button("📝 紹介投稿の下書きをコンテンツ管理へ送る"):
            body = snapshot["intro"] or f"{snapshot['disclosure']}\n{snapshot['name']}"
            if snapshot["disclosure"] and snapshot["disclosure"] not in body:
                body = f"{snapshot['disclosure']}\n{body}"
            with session_scope() as s:
                create_content(s, "x", "", body, actor=HUMAN_ACTOR, rakuten_item_id=iid)
            flash("コンテンツ管理に下書き（X向け）を作成しました。投稿先は編集画面で変更できます。")
            st.rerun()
