"""連携設定：Threads・Instagram・Google を、画面の案内どおりにつなぐ。"""

from __future__ import annotations

import json
from datetime import datetime

import streamlit as st

from ..config import get_settings, save_env_value
from ..connectors import google as g
from ..connectors.instagram import InstagramClient, InstagramError
from ..connectors.sync import connection_status, sync_all
from ..db import session_scope
from ..threads_analytics import get_setting, set_setting
from ..threads_api import ThreadsAPI, ThreadsAPIError
from .common import flash, show_flash
from .theme import hero


def _badge(ok: bool) -> str:
    return "🟢 接続済み" if ok else "⚪ 未接続"


def _save_token(prefix: str, token: str) -> None:
    save_env_value(f"{prefix}_ACCESS_TOKEN", token.strip())
    save_env_value(f"{prefix}_TOKEN_ISSUED_AT", datetime.now().isoformat(timespec="seconds"))


def _threads_card(connected: bool) -> None:
    with st.container(border=True):
        st.markdown(f"### 🧵 Threads　{_badge(connected)}")
        st.caption("できること：予約投稿・投稿と反応数の自動取得")
        with st.expander("つなぎ方（約20分）", expanded=not connected):
            st.markdown(
                "1. パソコンで **developers.facebook.com** を開き、Facebookでログイン\n"
                "2. 「アプリを作成」→ ユースケースで **「Threads APIにアクセス」** を選ぶ\n"
                "3. 権限に `threads_basic`・`threads_content_publish`・`threads_manage_insights` を追加\n"
                "4. 「役割」で自分の Threads アカウントをテスターに追加し、Threadsアプリ側で承認\n"
                "5. アクセストークンを発行して、長期トークン（60日）に交換\n"
                "6. 下の欄に貼り付けて「保存して確認」\n\n"
                "わからない画面があれば、スクリーンショットをチャドに送ってください。"
            )
        token = st.text_input("Threads のアクセストークン", type="password", key="th_token")
        if st.button("保存して確認", key="th_save", disabled=not token.strip()):
            try:
                me = ThreadsAPI(token.strip(), get_settings().threads_api_base).me()
            except ThreadsAPIError as e:
                st.error(f"確認できませんでした：{e}")
            else:
                _save_token("THREADS", token)
                flash(f"Threads（@{me.get('username', '?')}）とつながりました。予約投稿は「Threads運用」で設定できます。")
                st.rerun()


def _instagram_card(connected: bool) -> None:
    with st.container(border=True):
        st.markdown(f"### 📸 Instagram　{_badge(connected)}")
        st.caption("できること：フォロワー・リーチ・プロフィールアクセス・リンクのタップを自動取得（読み取りのみ）")
        with st.expander("つなぎ方（約20分）", expanded=not connected):
            st.markdown(
                "**前提**：Instagram が **プロアカウント（ビジネスまたはクリエイター）** であること（アプリの設定から無料で切り替え可）\n\n"
                "1. **developers.facebook.com** でアプリを作成し、ユースケースで **「Instagram API」（Instagramログイン）** を選ぶ\n"
                "2. 権限 `instagram_business_basic`・`instagram_business_manage_insights` を追加\n"
                "3. 自分の Instagram アカウントを追加して、アクセストークンを発行（長期トークン・60日）\n"
                "4. 下の欄に貼り付けて「保存して確認」\n\n"
                "※ Meta は指標の名前をよく変更します。取得できない指標があった場合は、その指標だけ手入力になります。"
            )
        token = st.text_input("Instagram のアクセストークン", type="password", key="ig_token")
        if st.button("保存して確認", key="ig_save", disabled=not token.strip()):
            try:
                prof = InstagramClient(token.strip(), get_settings().instagram_api_base).profile()
            except InstagramError as e:
                st.error(f"確認できませんでした：{e}")
            else:
                _save_token("INSTAGRAM", token)
                flash(f"Instagram（@{prof.get('username', '?')}）とつながりました。")
                st.rerun()


def _google_card(status: dict) -> None:
    with st.container(border=True):
        st.markdown(f"### 🔍📍 Google（Search Console・Googleマップ）　{_badge(status['seo'] or status['gbp'])}")
        st.caption("できること：検索の表示回数・クリック・平均順位・キーワードごとの順位、Googleマップの表示・ルート検索・電話・Webクリックを自動取得（読み取りのみ）")
        with st.expander("つなぎ方（約15分）", expanded=not (status["seo"] or status["gbp"])):
            st.markdown(
                "1. **console.cloud.google.com** を開き、新しいプロジェクトを作成\n"
                "2. 「APIとサービス」→「ライブラリ」で次を有効にする：**Google Search Console API**、**My Business Account Management API**、**My Business Business Information API**、**Business Profile Performance API**\n"
                "3. 「OAuth同意画面」を作成（種類：外部／テストユーザーに自分のGoogleアカウントを追加）\n"
                "4. 「認証情報」→「OAuthクライアントID」→ 種類 **「デスクトップアプリ」** で作成し、**JSONをダウンロード**\n"
                "5. 下でそのJSONを選び、「Googleでログイン」を押す（ブラウザが開きます）\n\n"
                "※ Googleマップ（ビジネスプロフィール）のAPIは、Googleへの**利用申請**が必要な場合があります（利用枠が0と表示されたら申請）。Search Console はすぐ使えます。"
            )
        if not g.has_client():
            up = st.file_uploader("OAuthクライアントのJSON（client_secret_….json）", type=["json"], key="g_client")
            if up is not None:
                try:
                    g.save_client_file(json.loads(up.getvalue().decode()))
                except (g.GoogleError, ValueError) as e:
                    st.error(str(e))
                else:
                    flash("JSONを登録しました。次に「Googleでログイン」を押してください。")
                    st.rerun()
            return
        if not g.is_logged_in():
            st.success("✅ クライアントJSONは登録済みです")
            if st.button("Googleでログイン", type="primary", key="g_login"):
                with st.spinner("ブラウザでGoogleにログインしてください（5分以内）…"):
                    try:
                        g.login_in_browser()
                    except Exception as e:  # noqa: BLE001
                        st.error(f"ログインできませんでした：{e}")
                    else:
                        flash("Googleにログインしました。次にサイトと店舗を選んでください。")
                        st.rerun()
            return
        st.success("✅ Googleにログイン済み")
        try:
            client = g.GoogleClient(g.default_requester())
        except g.GoogleError as e:
            st.error(str(e))
            return
        with session_scope() as s:
            cur_site, cur_loc = get_setting(s, "gsc_site"), get_setting(s, "gbp_location")
        c = st.columns(2)
        if c[0].button("Search Console のサイトを読み込む", key="g_sites"):
            try:
                st.session_state["g_sites_list"] = client.list_sites()
            except g.GoogleError as e:
                st.error(str(e))
        if c[1].button("Googleマップの店舗を読み込む", key="g_locs"):
            try:
                st.session_state["g_locs_list"] = client.list_locations()
            except g.GoogleError as e:
                st.error(str(e))
        sites = st.session_state.get("g_sites_list") or ([cur_site] if cur_site else [])
        locs = st.session_state.get("g_locs_list") or ([(cur_loc, cur_loc)] if cur_loc else [])
        site = st.selectbox("Search Console のサイト", ["（使わない）", *sites], index=(sites.index(cur_site) + 1) if cur_site in sites else 0)
        loc_names = {n: t for n, t in locs}
        loc = st.selectbox("Googleマップの店舗", ["（使わない）", *loc_names], format_func=lambda n: loc_names.get(n, n), index=(list(loc_names).index(cur_loc) + 1) if cur_loc in loc_names else 0)
        if st.button("この設定で保存", type="primary", key="g_save"):
            with session_scope() as s:
                set_setting(s, "gsc_site", "" if site == "（使わない）" else site)
                set_setting(s, "gbp_location", "" if loc == "（使わない）" else loc)
            flash("保存しました。「今すぐ数字を取得」で確認できます。")
            st.rerun()
        if st.button("Googleからログアウト", key="g_logout"):
            g.logout()
            st.rerun()


def render() -> None:
    show_flash()
    hero("つなぐだけで、数字が集まる。", "<b>Threads・Instagram・Google</b>の数字を自動で取得（読み取りのみ）")
    with session_scope() as s:
        status = connection_status(s)
        last = get_setting(s, "last_sync_all")
    c = st.columns([3, 1])
    c[0].markdown(
        f"Threads {_badge(status['threads'])}　／　Instagram {_badge(status['instagram'])}　／　Search Console {_badge(status['seo'])}　／　Googleマップ {_badge(status['gbp'])}  \n"
        f"<small>最終取得：{last[:16].replace('T', ' ') if last else 'まだ'}（scheduler.py を動かしていれば6時間ごとに自動取得）</small>",
        unsafe_allow_html=True,
    )
    if c[1].button("🔄 今すぐ数字を取得", type="primary", use_container_width=True):
        with session_scope() as s:
            reports = sync_all(s)
        if not reports:
            st.info("まだ接続済みのサービスがありません。")
        for r in reports:
            (st.success if r.ok else st.warning)(f"{r.service}：{r.message}")
    st.caption("🔒 取得するのは数字だけです。ログイン情報はこのパソコンの中（.env と .secrets フォルダ）にだけ保存され、Git やデータベースには保存されません。")
    _threads_card(status["threads"])
    _instagram_card(status["instagram"])
    _google_card(status)
