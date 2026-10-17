"""Threads運用：予約投稿・分析・AI改善・接続設定"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

import pandas as pd
import streamlit as st
from sqlalchemy import select

from ..ai.generators import threads_improvement
from ..config import get_settings, save_env_value
from ..db import session_scope
from ..models import SCHEDULE_LABELS, STATUS_APPROVED, Content, NoteProduct, ScheduledPost
from ..threads_analytics import (
    FEATURES,
    add_manual_post,
    analysis_facts,
    daily_post_target,
    feature_table,
    follower_series,
    get_setting,
    posts_frame,
    set_setting,
    sync_threads,
)
from ..threads_api import ThreadsAPIError
from ..threads_scheduler import cancel_schedule, make_api, run_due, schedule_post
from ..workflow import HUMAN_ACTOR, WorkflowError, create_content
from .common import ai_mode_caption, flash, fmt_dt, show_ai_result, show_flash
from .nav import link

SLOT_TIMES = {
    "朝（6〜10時）": time(7, 30),
    "昼（11〜14時）": time(12, 15),
    "午後（15〜18時）": time(17, 30),
    "夜（19〜23時）": time(21, 0),
    "深夜・早朝（0〜5時）": time(23, 0),
}


def _recommended_times(df: pd.DataFrame) -> tuple[list[time], str]:
    t = feature_table(df, "時間帯") if not df.empty else pd.DataFrame()
    t = t[t["件数"] >= 3] if not t.empty else t
    if t.empty:
        return [time(7, 30), time(12, 15), time(21, 0)], "初期値（データが増えると、伸びた時間帯に自動で変わります）"
    slots = [SLOT_TIMES[x] for x in t["時間帯"].tolist()[:3]]
    return sorted(slots), "これまでの投稿で平均閲覧が多かった時間帯"


def _status_box() -> None:
    s = get_settings()
    c = st.columns(3)
    c[0].markdown("**接続**：" + ("🟢 公式APIに接続済み" if s.threads_connected else "⚪ 未接続（手動記録モード）"))
    c[1].markdown("**予約投稿**：" + ("🟢 オン" if s.threads_posting_enabled else "⚪ オフ（予約しても投稿されません）"))
    c[2].markdown(f"**自社上限**：1日{s.threads_daily_limit}件・{s.threads_min_interval_min}分間隔")


def _tab_schedule(df: pd.DataFrame) -> None:
    s = get_settings()
    rec, why = _recommended_times(df)
    st.markdown(f"**おすすめの投稿時刻**：{'、'.join(t.strftime('%H:%M') for t in rec)}（{why}）")
    with session_scope() as ss:
        target = daily_post_target(ss)
    nt = st.number_input("1日の投稿目標（本）", 0, s.threads_daily_limit or 0, value=min(target, s.threads_daily_limit), help="今日やることの計算に使います。上限は .env の AIT_THREADS_DAILY_LIMIT")
    if nt != target:
        with session_scope() as ss:
            set_setting(ss, "threads_daily_target", str(int(nt)))
        st.rerun()

    st.subheader("承認済み・未予約の投稿")
    with session_scope() as ss:
        active_ids = set(ss.scalars(select(ScheduledPost.content_id).where(ScheduledPost.status.in_(["scheduled", "publishing"]))))
        approved = [(c.id, c.body) for c in ss.scalars(select(Content).where(Content.status == STATUS_APPROVED, Content.channel == "threads").order_by(Content.id)) if c.id not in active_ids]
    if not approved:
        st.caption("予約できる投稿はありません（Threads のコンテンツを承認すると、ここに出ます）。")
        link("contents", "→ コンテンツ管理で下書きを作る")
    for i, (cid, body) in enumerate(approved):
        with st.container(border=True):
            st.text(body)
            default_day = date.today() if datetime.now().time() < rec[min(i, len(rec) - 1)] else date.today() + timedelta(days=1)
            c = st.columns([2, 2, 2])
            d = c[0].date_input("投稿日", value=default_day, key=f"sd_{cid}")
            t = c[1].time_input("時刻", value=rec[min(i, len(rec) - 1)], key=f"st_{cid}", step=timedelta(minutes=15))
            if c[2].button("この日時で予約する", key=f"sb_{cid}", type="primary"):
                try:
                    with session_scope() as ss:
                        schedule_post(ss, ss.get(Content, cid), datetime.combine(d, t), HUMAN_ACTOR)
                except WorkflowError as e:
                    st.error(str(e))
                else:
                    flash(f"{d:%m/%d} {t:%H:%M} に予約しました。" + ("" if s.threads_posting_enabled else "（予約投稿のスイッチがオフのため、オンにするまで投稿されません）"))
                    st.rerun()

    st.subheader("予約の一覧")
    with session_scope() as ss:
        rows = ss.execute(
            select(ScheduledPost, Content.body).join(Content, Content.id == ScheduledPost.content_id).where(ScheduledPost.updated_at >= datetime.now() - timedelta(days=14)).order_by(ScheduledPost.scheduled_at.desc())
        ).all()
        data = [(sp.id, sp.scheduled_at, sp.status, sp.permalink, sp.last_error, body) for sp, body in rows]
    for sid, at, status, url, err, body in data:
        c = st.columns([2, 2, 6, 2])
        c[0].markdown(f"`{at:%m/%d %H:%M}`")
        c[1].markdown(SCHEDULE_LABELS.get(status, status))
        c[2].markdown((body.splitlines() or [""])[0][:50] + (f"  \n[投稿を開く]({url})" if url else "") + (f"  \n⚠️ {err}" if err else ""))
        if status == "scheduled" and c[3].button("取り消す", key=f"cx_{sid}"):
            with session_scope() as ss:
                cancel_schedule(ss, ss.get(ScheduledPost, sid), HUMAN_ACTOR)
            st.rerun()
    st.caption("予約時刻になると、別ウィンドウで動かしている「予約投稿の実行係」（scheduler.py）が投稿します。アプリを開いている間は下のボタンでも実行できます。")
    if st.button("期限が来た予約を今すぐ実行"):
        with session_scope() as ss:
            results = run_due(ss, make_api())
        for r in results or []:
            (st.success if r.outcome == "published" else st.warning)(f"予約#{r.schedule_id}：{r.message}")
        if not results:
            st.info("期限が来た予約はありません。")


def _tab_analysis(df: pd.DataFrame) -> None:
    s = get_settings()
    if s.threads_connected:
        with session_scope() as ss:
            last = get_setting(ss, "threads_last_sync")
        c = st.columns([3, 2])
        c[0].caption("最終同期：" + (last[:16].replace("T", " ") if last else "未実施") + "（scheduler.py を動かしていれば6時間ごとに自動同期）")
        if c[1].button("🔄 Threads と同期する", type="primary"):
            with session_scope() as ss:
                r = sync_threads(ss, make_api())
            msg = f"新しい投稿 {r.new_posts}件・反応数の更新 {r.updated_insights}件" + (f"・フォロワー {r.followers:,}人" if r.followers is not None else "")
            flash(msg + ("　⚠️ " + " / ".join(r.errors[:2]) if r.errors else ""), "warning" if r.errors else "success")
            st.rerun()
    else:
        with st.expander("✍️ 投稿の数字を手入力する（API未接続のとき）", expanded=df.empty):
            st.caption("Threads アプリの投稿 → 「インサイト」に表示される数字を転記します。")
            with st.form("manual_post", clear_on_submit=True):
                text = st.text_area("投稿の本文 *")
                url = st.text_input("投稿のURL（任意）")
                c = st.columns(2)
                d = c[0].date_input("投稿日", value=date.today())
                t = c[1].time_input("投稿時刻", value=time(21, 0))
                m = st.columns(6)
                vals = {k: m[i].number_input(lbl, min_value=0, step=1, key=f"m_{k}") for i, (k, lbl) in enumerate([("views", "閲覧"), ("likes", "いいね"), ("replies", "返信"), ("reposts", "再投稿"), ("quotes", "引用"), ("shares", "シェア")])}
                if st.form_submit_button("記録する") and text.strip():
                    with session_scope() as ss:
                        add_manual_post(ss, text.strip(), url.strip(), datetime.combine(d, t), vals)
                    flash("記録しました。")
                    st.rerun()

    d = df[df["取得"] == "あり"] if not df.empty else df
    if d.empty:
        st.info("まだ分析できる投稿がありません。" + ("「Threads と同期する」を押してください。" if s.threads_connected else "上のフォームから投稿の数字を入力してください。"))
        return
    c = st.columns(4)
    c[0].metric("分析対象の投稿", f"{len(d)}件")
    c[1].metric("平均閲覧数", f"{d['views'].mean():,.0f}")
    er = d["反応率"].dropna()
    c[2].metric("平均反応率", f"{er.mean() * 100:.2f}%" if not er.empty else "—", help="（いいね＋返信＋再投稿＋引用）÷閲覧")
    with session_scope() as ss:
        fs = follower_series(ss)
    c[3].metric("フォロワー", f"{int(fs['フォロワー数'].iloc[-1]):,}人" if not fs.empty else "—", delta=int(fs["フォロワー数"].iloc[-1] - fs["フォロワー数"].iloc[0]) if len(fs) > 1 else None)
    if len(d) < 10:
        st.caption("※投稿数が10件未満のため、傾向は参考値です。")

    st.markdown("#### 伸びた投稿 TOP5")
    st.dataframe(
        d.sort_values("views", ascending=False).head(5)[["投稿日時", "本文", "views", "likes", "replies", "reposts", "反応率", "URL"]].rename(columns={"views": "閲覧", "likes": "いいね", "replies": "返信", "reposts": "再投稿"}),
        hide_index=True,
        width="stretch",
        column_config={"反応率": st.column_config.NumberColumn(format="percent"), "URL": st.column_config.LinkColumn()},
    )
    st.markdown("#### どんな投稿が伸びているか（特徴ごとの平均）")
    st.caption("相関であり、原因とは限りません。「※件数が少ない」は参考程度に。")
    cols = st.columns(2)
    for i, f in enumerate(FEATURES):
        t = feature_table(d, f)
        if not t.empty:
            with cols[i % 2]:
                st.markdown(f"**{f}**")
                st.dataframe(t, hide_index=True, width="stretch", column_config={"平均閲覧": st.column_config.NumberColumn(format="%.0f"), "平均反応率": st.column_config.NumberColumn(format="percent")})
    if not fs.empty:
        st.markdown("#### フォロワー数の推移")
        st.line_chart(fs)
    with st.expander("すべての投稿"):
        st.dataframe(df.drop(columns=["id", "note商品"]), hide_index=True, width="stretch")


def _tab_ai(df: pd.DataFrame) -> None:
    st.caption("マーケティングAIが、伸びた投稿の共通点（仮説）と次の投稿案を作ります。投稿案は下書きとして保存され、承認と予約を経て投稿されます。")
    ai_mode_caption()
    with session_scope() as ss:
        products = {p.id: p.title for p in ss.scalars(select(NoteProduct).where(NoteProduct.status != "停止"))}
    pid = st.selectbox("誘導する note 商品", [None, *products], format_func=lambda i: "（認知拡大のみ）" if i is None else products[i], key="ai_pid")
    n = st.slider("投稿案の数", 1, 5, 3)
    if st.button("分析して改善案を作る", type="primary"):
        with session_scope() as ss:
            facts = analysis_facts(df) if not df.empty else {"posts_with_insights": 0}
            prod = None
            if pid:
                p = ss.get(NoteProduct, pid)
                prod = {"title": p.title, "concept": p.concept, "price_yen": p.price_yen, "cta": p.cta}
            res = threads_improvement(ss, facts, prod, count=n)
            st.session_state["threads_ai"] = (res.data, res.label, res.notice, pid)
        show_ai_result(res)
    if "threads_ai" in st.session_state:
        data, label, notice, pid_saved = st.session_state["threads_ai"]
        st.markdown("**伸びた投稿の共通点（仮説）**")
        for h in data.get("hypotheses", []):
            st.markdown(f"- {h}")
        st.markdown("**次に試すこと**")
        for e in data.get("experiments", []):
            st.markdown(f"- {e}")
        st.markdown("**投稿案**")
        for i, post in enumerate(data.get("next_posts", [])):
            with st.container(border=True):
                st.caption(f"切り口：{post.get('angle', '')}／ねらい：{post.get('why', '')}")
                st.text(post["body"])
                if st.button("下書きとして保存", key=f"save_ai_{i}"):
                    with session_scope() as ss:
                        create_content(ss, "threads", "", post["body"], actor="マーケティングAI", ai_generated=True, note_product_id=pid_saved)
                    flash("下書きとして保存しました。コンテンツ管理でレビューに出してください。")
                    st.rerun()


def _tab_connect() -> None:
    s = get_settings()
    st.markdown(
        """
**接続までの流れ**（初回のみ。画面に沿って一緒に進めます）
1. Meta for Developers（developers.facebook.com）でアプリを作り、「Threads API にアクセス」を選ぶ
2. 権限 `threads_basic`・`threads_content_publish`・`threads_manage_insights` を追加し、自分の Threads アカウントをテスターに追加して承認する
3. アクセストークンを発行し、長期トークン（60日）に交換する
4. `.env` の `THREADS_ACCESS_TOKEN` に貼り付け、`THREADS_TOKEN_ISSUED_AT` に発行日時を書く
5. 動作を確認したら `AIT_THREADS_POSTING_ENABLED=true` にして予約投稿をオンにする

※ トークンは `.env` だけに保存されます（Git・データベースには保存しません）。
"""
    )
    if not s.threads_connected:
        st.info("未接続です。接続するまでは、投稿の数字を手入力して分析できます。")
        return
    if st.button("接続を確認する"):
        api = make_api()
        try:
            me = api.me()
            st.success(f"接続OK：@{me.get('username', '?')}")
            lim = api.publishing_limit()
            if lim:
                st.caption(f"公式の投稿枠（24時間）：{lim[0]} / {lim[1]} 件使用")
        except ThreadsAPIError as e:
            st.error(str(e))
    issued = s.threads_token_issued_at
    st.caption(f"トークン発行日時：{issued or '未記入'}（60日で期限切れ。scheduler.py が7日ごとに自動更新します）")
    if st.button("トークンを今すぐ更新する"):
        try:
            token, expires = make_api().refresh_token()
            save_env_value("THREADS_ACCESS_TOKEN", token)
            save_env_value("THREADS_TOKEN_ISSUED_AT", datetime.now().isoformat(timespec="seconds"))
            flash(f"トークンを更新しました（有効期限：約{expires // 86400}日）。")
            st.rerun()
        except ThreadsAPIError as e:
            st.error(str(e) + "（発行から24時間以内のトークンは更新できません）")


def render() -> None:
    st.title("🧵 Threads運用")
    st.caption("分析 → AIが改善案 → 社長が承認・予約 → 公式APIで投稿 → 反応を取得、の流れで認知を広げ、note へつなげます。")
    show_flash()
    _status_box()
    with session_scope() as ss:
        df = posts_frame(ss, since=datetime.now() - timedelta(days=90))
    t1, t2, t3, t4 = st.tabs(["🗓 予約投稿", "📈 分析", "🤖 AI改善案", "🔌 接続設定"])
    with t1:
        _tab_schedule(df)
    with t2:
        _tab_analysis(df)
    with t3:
        _tab_ai(df)
    with t4:
        _tab_connect()
