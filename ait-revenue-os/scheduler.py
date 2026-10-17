"""予約投稿の実行係。アプリとは別のターミナルで動かしておく。

    source .venv/bin/activate
    python scheduler.py

- 1分ごとに、期限が来た予約投稿を確認して投稿する（1回に1件・自社上限と間隔を守る）
- 6時間ごとに、Threads・Instagram・Google（Search Console・ビジネスプロフィール）の数字を取得する
- 7日ごとに、Threads の長期トークンを更新して .env に保存する
止めるときは Ctrl + C。
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta

from revenue_os.config import get_settings, save_env_value
from revenue_os.db import init_db, session_scope
from revenue_os.connectors.sync import sync_all
from revenue_os.threads_api import ThreadsAPIError
from revenue_os.threads_scheduler import make_api, run_due

SYNC_EVERY = timedelta(hours=6)
REFRESH_EVERY = timedelta(days=7)


def log(msg: str) -> None:
    print(f"[{datetime.now():%m/%d %H:%M:%S}] {msg}", flush=True)


def maybe_refresh_token() -> None:
    s = get_settings()
    if not s.threads_access_token or not s.threads_token_issued_at:
        return
    try:
        issued = datetime.fromisoformat(s.threads_token_issued_at)
    except ValueError:
        return
    if datetime.now() - issued < REFRESH_EVERY:
        return
    try:
        token, expires = make_api(s).refresh_token()
    except ThreadsAPIError as e:
        log(f"⚠️ トークンの更新に失敗：{e}")
        return
    save_env_value("THREADS_ACCESS_TOKEN", token)
    save_env_value("THREADS_TOKEN_ISSUED_AT", datetime.now().isoformat(timespec="seconds"))
    log(f"🔑 トークンを更新しました（約{expires // 86400}日有効）")


def main() -> None:
    init_db()
    s = get_settings()
    log("予約投稿の実行係を開始しました（止めるときは Ctrl + C）")
    log(f"接続：{'あり' if s.threads_connected else 'なし'}／予約投稿：{'オン' if s.threads_posting_enabled else 'オフ'}／上限 1日{s.threads_daily_limit}件・{s.threads_min_interval_min}分間隔")
    last_sync = datetime.min
    last_skip_msg = ""
    while True:
        try:
            maybe_refresh_token()
            api = make_api()
            with session_scope() as ss:
                for r in run_due(ss, api):
                    if r.outcome == "skipped":
                        if r.message != last_skip_msg:
                            log(f"⏸ 予約#{r.schedule_id}：{r.message}")
                            last_skip_msg = r.message
                    else:
                        log({"published": "✅", "retry": "🔁", "failed": "❌"}.get(r.outcome, "・") + f" 予約#{r.schedule_id}：{r.message}")
            if datetime.now() - last_sync >= SYNC_EVERY:
                with session_scope() as ss:
                    for rep in sync_all(ss):
                        log(f"🔄 {rep.service}：{'✅' if rep.ok else '⚠️'} {rep.message}")
                last_sync = datetime.now()
        except Exception as e:  # noqa: BLE001 - 実行係は止めずに次の周期で再試行する
            log(f"⚠️ エラー：{e}")
        time.sleep(60)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("終了しました")
