"""1. 経営ダッシュボード"""

from __future__ import annotations

from datetime import date, timedelta

import pandas as pd
import streamlit as st
from sqlalchemy import select

from ..ai.generators import accounting_insight
from ..db import session_scope
from ..kpi import compute_kpi, daily_revenue, fmt_pct, fmt_yen
from ..models import EXPENSE_CATEGORIES, AIUsage, ChannelMetric, Expense
from .common import ai_mode_caption, flash, include_sample, show_ai_result, show_flash


def _period() -> tuple[date, date]:
    today = date.today()
    choice = st.radio("期間", ["今月", "過去7日", "過去30日", "期間を指定"], horizontal=True)
    if choice == "今月":
        return today.replace(day=1), today
    if choice == "過去7日":
        return today - timedelta(days=6), today
    if choice == "過去30日":
        return today - timedelta(days=29), today
    rng = st.date_input("期間を指定", value=(today - timedelta(days=29), today))
    if isinstance(rng, tuple) and len(rng) == 2:
        return rng[0], rng[1]
    return today, today


def render() -> None:
    st.title("📊 経営ダッシュボード")
    show_flash()
    start, end = _period()
    sample = include_sample()

    with session_scope() as s:
        k = compute_kpi(s, start, end, sample)
        daily = daily_revenue(s, start, end, sample)

    st.caption(f"{start:%Y/%m/%d} 〜 {end:%Y/%m/%d}" + ("（サンプルデータを含む）" if sample else "（サンプル除外）"))
    c = st.columns(6)
    c[0].metric("売上（受取額）", fmt_yen(k.revenue_yen), help="note＝売上−手数料、楽天＝成果報酬額 の合計")
    c[1].metric("件数", f"{k.orders:,}件")
    c[2].metric("CTR", fmt_pct(k.ctr), help="クリック数 ÷ 表示回数（下の「指標の記録」から入力）")
    c[3].metric("CVR", fmt_pct(k.cvr), help="成果件数 ÷ クリック数")
    c[4].metric("費用", fmt_yen(k.cost_yen), help=f"経費 {fmt_yen(k.expenses_yen)} ＋ AI利用料 {fmt_yen(k.ai_cost_yen)}")
    c[5].metric("粗利益", fmt_yen(k.gross_profit_yen), help="売上（受取額）−費用")

    st.subheader("note と楽天の内訳")
    table = pd.DataFrame(
        [
            ["note", k.note.orders, k.note.gross_yen, k.note.fee_yen, k.note.revenue_yen],
            ["楽天アフィリエイト", k.rakuten.orders, k.rakuten.gross_yen, k.rakuten.fee_yen, k.rakuten.revenue_yen],
            ["合計", k.orders, k.note.gross_yen + k.rakuten.gross_yen, k.note.fee_yen + k.rakuten.fee_yen, k.revenue_yen],
        ],
        columns=["販売元", "件数", "売上・購入金額（円）", "手数料（円）", "受取額（円）"],
    )
    st.dataframe(table, hide_index=True, width="stretch")
    st.caption("※楽天の「購入金額」は購入者が支払った金額で、A.I.T company の売上ではありません。受取額は成果報酬額です。")

    st.subheader("日別の受取額")
    st.bar_chart(daily, stack=True, y_label="円")

    with st.expander("🧮 経理分析AIに数字を読んでもらう"):
        ai_mode_caption()
        if st.button("分析する", key="acc_ai"):
            with session_scope() as s:
                res = accounting_insight(
                    s,
                    {"period": f"{start}〜{end}", "revenue_yen": k.revenue_yen, "orders": k.orders, "cost_yen": round(k.cost_yen, 2), "gross_profit_yen": round(k.gross_profit_yen, 2), "ctr": k.ctr, "cvr": k.cvr},
                )
            show_ai_result(res)
            st.markdown("**気づき（実績に基づく）**")
            for o in res.data.get("observations", []):
                st.markdown(f"- {o}")
            st.markdown("**改善提案（仮説・要検証）**")
            for o in res.data.get("suggestions", []):
                st.markdown(f"- {o}")

    col1, col2 = st.columns(2)
    with col1, st.expander("📈 指標の記録（CTR・CVR用）"):
        st.caption("各サービスの管理画面で確認した数字を転記します（自動取得はしません）。同じ日・同じチャネルは上書きされます。")
        with st.form("metric_form", clear_on_submit=True):
            d = st.date_input("日付", value=date.today())
            ch = st.selectbox("チャネル", ["note", "rakuten", "threads", "x"], format_func=lambda x: {"rakuten": "楽天"}.get(x, x))
            imp = st.number_input("表示回数", min_value=0, step=1)
            clk = st.number_input("クリック数", min_value=0, step=1)
            conv = st.number_input("成果件数（購入・成約）", min_value=0, step=1)
            if st.form_submit_button("記録する"):
                if clk > imp and imp > 0:
                    st.error("クリック数が表示回数を超えています。数字を確認してください。")
                else:
                    with session_scope() as s:
                        m = s.scalar(select(ChannelMetric).where(ChannelMetric.metric_date == d, ChannelMetric.channel == ch, ChannelMetric.is_sample.is_(False)))
                        if m is None:
                            m = ChannelMetric(metric_date=d, channel=ch)
                            s.add(m)
                        m.impressions, m.clicks, m.conversions = int(imp), int(clk), int(conv)
                    flash("指標を記録しました。")
                    st.rerun()
    with col2, st.expander("💴 経費の記録"):
        with st.form("expense_form", clear_on_submit=True):
            d = st.date_input("日付", value=date.today(), key="exp_d")
            cat = st.selectbox("区分", EXPENSE_CATEGORIES)
            amount = st.number_input("金額（円）", min_value=0, step=100)
            note = st.text_input("メモ")
            if st.form_submit_button("記録する"):
                with session_scope() as s:
                    s.add(Expense(expense_date=d, category=cat, amount_yen=int(amount), note=note))
                flash("経費を記録しました。")
                st.rerun()

    with st.expander("🤖 AI利用履歴（直近50件）"):
        with session_scope() as s:
            rows = s.scalars(select(AIUsage).order_by(AIUsage.id.desc()).limit(50)).all()
            df = pd.DataFrame(
                [{"日時": r.created_at, "役割": r.role, "用途": r.purpose, "方式": "API" if r.mode == "api" else "テンプレート", "モデル": r.model, "入力トークン": r.input_tokens, "出力トークン": r.output_tokens, "推定費用（円）": r.cost_yen, "エラー": r.error} for r in rows]
            )
        st.dataframe(df, hide_index=True, width="stretch")
