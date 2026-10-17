"""7. 売上CSVインポート"""

from __future__ import annotations

import pandas as pd
import streamlit as st
from sqlalchemy import select

from ..csv_import import TARGET_FIELDS, ImportError_, guess_mapping, import_sales, normalize_rows, read_csv_bytes
from ..db import session_scope
from ..models import ImportBatch, SalesRecord
from .common import flash, fmt_dt, include_sample, show_flash

SOURCE_LABEL = {"note": "note", "rakuten": "楽天アフィリエイト"}


def render() -> None:
    st.title("📥 売上CSVインポート")
    st.caption(
        "note と楽天アフィリエイトの管理画面からダウンロードしたCSVを取り込みます。"
        "CSVの列名は変わることがあるため、どの列が何かを画面で対応付けてから取り込みます。"
        "同じ注文（同じ注文ID・同じ行）は二重に取り込まれません。"
    )
    show_flash()

    source = st.radio("取り込み先", ["note", "rakuten"], format_func=SOURCE_LABEL.get, horizontal=True)
    up = st.file_uploader("CSVファイル", type=["csv"], key=f"up_{source}")
    if up is not None:
        data = up.getvalue()
        try:
            df = read_csv_bytes(data)
        except ImportError_ as e:
            st.error(str(e))
            return
        st.markdown(f"**読み込んだCSV**（{len(df)}行・先頭5行）")
        st.dataframe(df.head(5), hide_index=True, width="stretch")

        st.markdown("**列の対応付け**（* は必須。「受取額」がない note の場合は 売上−手数料 で計算します）")
        guessed = guess_mapping(list(df.columns), source)
        options = ["（使わない）", *df.columns]
        mapping: dict[str, str] = {}
        cols = st.columns(2)
        for n, (key, (label, required)) in enumerate(TARGET_FIELDS.items()):
            default = guessed.get(key)
            choice = cols[n % 2].selectbox(
                label + (" *" if required else ""),
                options,
                index=options.index(default) if default in options else 0,
                key=f"map_{source}_{key}",
            )
            if choice != "（使わない）":
                mapping[key] = choice
        if source == "rakuten":
            st.caption("楽天は「成果報酬」の列を「受取額・報酬額」に対応付けてください（購入金額は A.I.T company の売上ではありません）。")

        try:
            preview = normalize_rows(df, source, mapping)
        except ImportError_ as e:
            st.warning(str(e))
            return
        st.markdown(f"**取り込み内容の確認**：{len(preview.rows)}行を取り込み可能、{len(preview.errors)}行にエラー")
        if preview.rows:
            pv = pd.DataFrame(preview.rows).drop(columns=["dedupe_key"]).rename(
                columns={"order_date": "日付", "item_name": "商品名", "external_id": "注文ID", "quantity": "数量", "gross_yen": "売上（円）", "fee_yen": "手数料（円）", "revenue_yen": "受取額（円）", "status": "状態"}
            )
            st.dataframe(pv.head(20), hide_index=True, width="stretch")
            st.markdown(f"受取額の合計：**¥{sum(r['revenue_yen'] for r in preview.rows):,}**")
        for err in preview.errors[:20]:
            st.error(f"{err.row_number}行目：{err.message}")
        if st.button("この内容で取り込む", type="primary", disabled=not preview.rows):
            with session_scope() as s:
                result = import_sales(s, source, up.name, data, mapping)
            msg = f"取り込み完了：新規 {result.imported}件、重複のためスキップ {result.duplicated}件、エラー {len(result.errors)}件。"
            if result.same_file_before:
                msg += "（このファイルは以前にも取り込まれています）"
            flash(msg)
            st.rerun()

    st.subheader("取り込み履歴")
    with session_scope() as s:
        batches = s.scalars(select(ImportBatch).order_by(ImportBatch.id.desc()).limit(30)).all()
        st.dataframe(
            pd.DataFrame(
                [{"日時": fmt_dt(b.created_at), "取り込み先": SOURCE_LABEL.get(b.source, b.source), "ファイル": b.filename, "行数": b.rows_total, "新規": b.rows_imported, "重複": b.rows_duplicated, "エラー": b.rows_error} for b in batches]
            ),
            hide_index=True,
            width="stretch",
        )

    st.subheader("売上データ")
    with session_scope() as s:
        q = select(SalesRecord).where(SalesRecord.source == source).order_by(SalesRecord.order_date.desc()).limit(200)
        if not include_sample():
            q = q.where(SalesRecord.is_sample.is_(False))
        recs = s.scalars(q).all()
        st.dataframe(
            pd.DataFrame(
                [{"": "🧪" if r.is_sample else "", "日付": r.order_date, "商品名": r.item_name, "注文ID": r.external_id, "数量": r.quantity, "売上（円）": r.gross_yen, "手数料（円）": r.fee_yen, "受取額（円）": r.revenue_yen, "状態": r.status} for r in recs]
            ),
            hide_index=True,
            width="stretch",
        )
