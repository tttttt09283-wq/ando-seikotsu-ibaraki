"""集客ハブ：すべての集客チャネルを1つの画面で管理する。"""

from __future__ import annotations

from datetime import date

import streamlit as st

from ..acquisition import CHANNEL_BY_KEY, CHANNELS, AUTO_METRICS, acquisition_facts, channel_statuses, enabled_channels, record_kpis, review_stats, set_enabled_channels
from ..ai.generators import acquisition_analysis
from ..db import session_scope
from .common import ai_mode_caption, flash, show_ai_result, show_flash
from .nav import link
from .theme import esc, feature_tiles, hero


def _fmt(v: float | None, label: str) -> str:
    if v is None:
        return "—"
    if "円" in label:
        return f"¥{v:,.0f}"
    if "%" in label:
        return f"{v:.1f}%"
    if "順位" in label:
        return f"{v:.1f}位"
    return f"{v:,.0f}"


def _cards(statuses) -> None:
    cells = []
    for c in statuses:
        p = c.primary
        delta = ""
        if p.delta_pct is not None:
            cls = "up" if p.improving else "down" if p.improving is False else ""
            arrow = "▲" if p.delta_pct > 0 else "▼" if p.delta_pct < 0 else "±"
            delta = f'<span class="delta {cls}">{arrow}{abs(p.delta_pct):.0f}%</span>'
        sub = " ／ ".join(f"{esc(m.label.split('（')[0])} {esc(_fmt(m.value, m.label))}" for m in c.metrics if m is not p and m.value is not None)[:80]
        mode_cls = "" if c.mode in ("API連携", "RSS連携", "自動集計") else "manual"
        last = f"最終記録 {c.last_recorded:%m/%d}" if c.last_recorded else "未記録"
        warn = " warn" if c.issues else ""
        cells.append(
            f'<div class="ait-card{warn}"><div class="top"><span class="icon">{c.cdef.icon}</span><span class="name">{esc(c.cdef.name)}</span>'
            f'<span class="mode {mode_cls}">{esc(c.mode)}</span></div>'
            f'<div class="kpi">{esc(_fmt(p.value, p.label))}<small>{esc(p.label)}</small> {delta}</div>'
            f'<div class="meta">{sub or "&nbsp;"}</div><div class="meta">{esc(last)}{"　⚠️ " + esc(c.issues[0]) if c.issues else ""}</div></div>'
        )
    st.markdown(f'<div class="ait-grid">{"".join(cells)}</div>', unsafe_allow_html=True)


def _record_form() -> None:
    with session_scope() as s:
        keys = enabled_channels(s)
    manual = [k for k in keys if any((k, m.key) not in AUTO_METRICS for m in CHANNEL_BY_KEY[k].metrics)]
    if not manual:
        st.caption("手動で記録するチャネルはありません。")
        return
    ch = st.selectbox("チャネル", manual, format_func=lambda k: f"{CHANNEL_BY_KEY[k].icon} {CHANNEL_BY_KEY[k].name}")
    cdef = CHANNEL_BY_KEY[ch]
    st.caption(f"📍 確認する場所：{cdef.where}　／　累計は現在の値、それ以外は『過去7日間』の合計を入れてください。空欄は記録しません。")
    with st.form(f"kpi_{ch}", clear_on_submit=True):
        d = st.date_input("記録日", value=date.today())
        cols = st.columns(2)
        vals = {}
        for i, m in enumerate(cdef.metrics):
            if (ch, m.key) in AUTO_METRICS:
                continue
            txt = cols[i % 2].text_input(m.label, key=f"kv_{ch}_{m.key}", placeholder="例：1234")
            vals[m.key] = txt
        if st.form_submit_button("記録する", type="primary"):
            try:
                parsed = {k: (float(v.replace(",", "")) if v.strip() else None) for k, v in vals.items()}
                with session_scope() as s:
                    n = record_kpis(s, ch, d, parsed)
            except ValueError as e:
                st.error(f"数字として読めない値があります：{e}")
            else:
                flash(f"{cdef.name} の数字を {n}件 記録しました。" if n else "記録する数字がありませんでした。", "success" if n else "info")
                st.rerun()


def render() -> None:
    show_flash()
    hero("集客を、ひとつの画面で。", "<b>SNS・MEO・SEO・AIO</b>の数字と施策を、まとめて管理")
    with session_scope() as s:
        statuses = channel_statuses(s)
        rv = review_stats(s)
        facts = acquisition_facts(s)

    st.markdown("### 📡 チャネル一覧")
    st.caption("「API連携」「自動集計」はアプリが自動で集計、「手動」は各管理画面の数字を転記したものです。⚠️ は対応が必要なチャネルです。")
    _cards(statuses)

    st.markdown("### 🧰 集客の機能")
    feature_tiles(
        [
            ("📝", "投稿作成", "SNS・note・Googleの投稿をAIで下書き"),
            ("🔎", "検索対策", "SEO・MEO・AI検索の順位と言及を記録"),
            ("⭐", "口コミ対策", f"未返信 {rv.unreplied}件・平均 {rv.average or '—'}"),
            ("📊", "AI分析", "課題と改善ポイントを自動で抽出"),
        ]
    )
    c = st.columns(4)
    link("contents", "投稿作成を開く →", c[0])
    link("search", "検索対策を開く →", c[1])
    link("reviews", "口コミ対策を開く →", c[2])
    c[3].markdown("<small>AI分析は下にあります ↓</small>", unsafe_allow_html=True)

    st.markdown("### 📊 AI分析")
    issues = facts["issues"]
    st.markdown(
        '<div class="ait-steps">'
        f'<div class="ait-step"><div class="t">① 集客データ分析</div><ul><li>記録中のチャネル：{len(statuses)}</li><li>口コミ：{rv.count}件（平均 {rv.average or "—"}）</li><li>検索キーワード：{len(facts["keywords"])}件</li></ul></div>'
        f'<div class="ait-step"><div class="t">② 課題を可視化</div><ul>{"".join(f"<li>{esc(i)}</li>" for i in issues[:5]) or "<li>大きな課題はありません</li>"}</ul></div>'
        '<div class="ait-step"><div class="t">③ 改善ポイント</div><ul><li>下のボタンでAIが具体的な行動を提案します</li></ul></div>'
        "</div>",
        unsafe_allow_html=True,
    )
    ai_mode_caption()
    if st.button("AIに改善ポイントを出してもらう", type="primary"):
        with session_scope() as s:
            res = acquisition_analysis(s, facts)
        st.session_state["acq_ai"] = res.data
        show_ai_result(res)
    data = st.session_state.get("acq_ai")
    if data:
        st.markdown(f"**要約**：{data.get('summary', '')}")
        for imp in data.get("improvements", []):
            with st.container(border=True):
                st.markdown(f"**{imp.get('channel', '')}**：{imp.get('action', '')}")
                st.caption(imp.get("why", ""))

    st.markdown("### ✍️ 数字の記録・設定")
    t1, t2 = st.tabs(["数字を記録する", "使うチャネルを選ぶ"])
    with t1:
        _record_form()
    with t2:
        with session_scope() as s:
            current = enabled_channels(s)
        chosen = st.multiselect("表示するチャネル", [c.key for c in CHANNELS], default=current, format_func=lambda k: f"{CHANNEL_BY_KEY[k].icon} {CHANNEL_BY_KEY[k].name}")
        if st.button("保存する", key="save_channels"):
            with session_scope() as s:
                set_enabled_channels(s, chosen)
            flash("表示するチャネルを保存しました。")
            st.rerun()
