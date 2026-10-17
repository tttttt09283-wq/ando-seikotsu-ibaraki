"""検索対策：Web検索（SEO）・Googleマップ（MEO）・AI検索（AIO）の順位と言及を記録する。"""

from __future__ import annotations

import pandas as pd
import streamlit as st

from ..acquisition import add_check, add_keyword, aio_mention_rate, keyword_rows
from ..db import session_scope
from ..models import SEARCH_KINDS, SearchKeyword
from .common import flash, fmt_dt, show_flash
from .theme import hero

TIPS = {
    "seo": "Google で検索し（ログアウト状態・シークレットウィンドウ推奨）、自分のページが何位に出たかを記録します。Search Console の「平均掲載順位」でも可。",
    "meo": "Googleマップで検索し、自分の店舗が何番目に出たかを記録します（検索する場所によって変わるため、いつも同じ場所で確認）。",
    "aio": "ChatGPT・Gemini・Google の「AIによる概要」などに質問し、回答に自社（店名・サービス名）が出たかを記録します。",
}
AIO_TIPS = [
    "よくある質問と答えを、自社サイト・note・Googleビジネスプロフィールに分かりやすく書く",
    "店名・サービス名・地域・料金など、事実情報を各サービスで同じ表記にそろえる",
    "実際の事例や手順など、一次情報（自分たちにしか書けない内容）を発信する",
]


def render() -> None:
    show_flash()
    hero("検索で、見つけてもらう。", "<b>SEO・MEO・AI検索</b>の順位と言及を記録して改善")
    with session_scope() as s:
        rate = aio_mention_rate(s, pd.Timestamp.today().date())
        rows = keyword_rows(s)
    c = st.columns(4)
    for i, (k, label) in enumerate(SEARCH_KINDS.items()):
        kr = [r for r in rows if r.kind == k]
        if k == "aio":
            c[i].metric(label, "—" if rate is None else f"言及率 {rate:.0f}%", help="AI検索の質問のうち、最新の確認で自社が言及された割合")
        else:
            ranked = [r.rank for r in kr if r.rank]
            c[i].metric(label, f"平均 {sum(ranked) / len(ranked):.1f}位" if ranked else "—", help=f"{len(kr)}キーワード")
    c[3].metric("確認が古いキーワード", f"{sum(1 for r in rows if r.stale)}件", help="14日以上確認していないもの")

    tabs = st.tabs([SEARCH_KINDS[k] for k in SEARCH_KINDS])
    for tab, kind in zip(tabs, SEARCH_KINDS, strict=True):
        with tab:
            st.caption(TIPS[kind])
            kr = [r for r in rows if r.kind == kind]
            if kr:
                df = pd.DataFrame(
                    [
                        {
                            "キーワード" if kind != "aio" else "AIへの質問": r.keyword,
                            "表示させたいもの": r.target,
                            **({"最新": "✅ 言及あり" if r.mentioned else ("❌ なし" if r.mentioned is False else "—"), "確認先": r.engine} if kind == "aio" else {"順位": r.rank or ("圏外" if r.last_check else "—"), "前回": r.prev_rank or "—", "変化": ("↑" if r.rank and r.prev_rank and r.rank < r.prev_rank else "↓" if r.rank and r.prev_rank and r.rank > r.prev_rank else "")}),
                            "最終確認": fmt_dt(r.last_check) + (" ⚠️" if r.stale else ""),
                        }
                        for r in kr
                    ]
                )
                st.dataframe(df, hide_index=True, width="stretch")
                with st.form(f"check_{kind}", clear_on_submit=True):
                    st.markdown("**確認結果を記録**")
                    kid = st.selectbox("キーワード", [r.id for r in kr], format_func=lambda i: next(r.keyword for r in kr if r.id == i))
                    cols = st.columns(3)
                    if kind == "aio":
                        mentioned = cols[0].radio("回答に自社が出た？", ["出た", "出なかった"], horizontal=True) == "出た"
                        engine = cols[1].selectbox("確認先", ["ChatGPT", "Gemini", "GoogleのAIによる概要", "Perplexity", "その他"])
                        rank = None
                    else:
                        r_in = cols[0].number_input("順位（圏外は0）", min_value=0, step=1)
                        rank = int(r_in) or None
                        mentioned = None
                        engine = cols[1].selectbox("確認先", ["Google", "Search Console"] if kind == "seo" else ["Googleマップ"])
                    memo = cols[2].text_input("メモ")
                    if st.form_submit_button("記録する", type="primary"):
                        with session_scope() as s:
                            add_check(s, s.get(SearchKeyword, kid), rank=rank, mentioned=mentioned, engine=engine, memo=memo)
                        flash("記録しました。")
                        st.rerun()
            else:
                st.info("まだキーワードがありません。下から追加してください。")
            with st.form(f"kw_{kind}", clear_on_submit=True):
                st.markdown("**キーワードを追加**")
                cols = st.columns([3, 2])
                kw = cols[0].text_input("キーワード" if kind != "aio" else "AIへの質問（例：茨木市でおすすめの整骨院は？）")
                target = cols[1].text_input("表示させたいページ・店舗名")
                if st.form_submit_button("追加する"):
                    try:
                        with session_scope() as s:
                            add_keyword(s, kind, kw, target)
                    except ValueError as e:
                        st.error(str(e))
                    else:
                        flash("追加しました。")
                        st.rerun()
            if kind == "aio":
                st.markdown("**AI検索で言及されやすくするために（基本）**")
                for t in AIO_TIPS:
                    st.markdown(f"- {t}")
