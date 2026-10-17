"""Threads 公式API（Meta）の最小クライアント。

使うのは公式に公開されている次の操作だけ：
- 自分のプロフィール取得       GET  /me?fields=id,username
- テキスト投稿のコンテナ作成   POST /me/threads            (media_type=TEXT, text)
- コンテナの公開               POST /me/threads_publish    (creation_id)
- 投稿の詳細                   GET  /{media-id}?fields=...
- 自分の投稿一覧               GET  /me/threads?fields=...
- 投稿のインサイト             GET  /{media-id}/insights?metric=views,likes,replies,reposts,quotes,shares
- アカウントのインサイト       GET  /me/threads_insights?metric=followers_count
- 投稿上限の利用状況           GET  /me/threads_publishing_limit
- 長期トークンの更新           GET  /refresh_access_token?grant_type=th_refresh_token

返信・DM・フォロー・他人の投稿への操作は実装しない。
接続先（graph.threads.net / .com）は .env の THREADS_API_BASE で変更できる。
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime

INSIGHT_METRICS = ["views", "likes", "replies", "reposts", "quotes", "shares"]
POST_FIELDS = "id,text,timestamp,permalink,media_type"
MAX_TEXT_LENGTH = 500

# (method, url, params) -> JSON(dict)。テストではここを差し替えて実際の通信をしない
Transport = Callable[[str, str, dict], dict]


class ThreadsAPIError(Exception):
    """利用者に表示できる日本語のエラー。"""


def _default_transport(method: str, url: str, params: dict) -> dict:
    data = None
    if method == "GET":
        url = f"{url}?{urllib.parse.urlencode(params)}"
    else:
        data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(url, data=data, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as res:  # noqa: S310 - 接続先は固定のThreads公式API
            return json.loads(res.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            err = json.loads(e.read().decode()).get("error", {})
            msg = err.get("error_user_msg") or err.get("message") or str(e)
        except Exception:  # noqa: BLE001
            msg = str(e)
        if e.code in (401, 403) or "token" in msg.lower():
            raise ThreadsAPIError(f"Threadsの認証に失敗しました（トークンの期限切れ・権限不足の可能性）：{msg}") from e
        raise ThreadsAPIError(f"Threads APIエラー（{e.code}）：{msg}") from e
    except urllib.error.URLError as e:
        raise ThreadsAPIError(f"Threadsに接続できませんでした：{e.reason}") from e


def parse_timestamp(value: str) -> datetime:
    """'2026-10-17T10:00:00+0000' 形式をローカル時刻（タイムゾーンなし）に変換する。"""
    v = value.replace("Z", "+0000")
    if len(v) > 5 and v[-5] in "+-" and v[-3] != ":":
        v = v[:-2] + ":" + v[-2:]
    return datetime.fromisoformat(v).astimezone().replace(tzinfo=None)


@dataclass
class ThreadsAPI:
    access_token: str
    base_url: str = "https://graph.threads.net/v1.0"
    transport: Transport = _default_transport

    def _call(self, method: str, path: str, **params) -> dict:
        params = {k: v for k, v in params.items() if v is not None}
        params["access_token"] = self.access_token
        return self.transport(method, f"{self.base_url}/{path.lstrip('/')}", params)

    # ---- プロフィール ----
    def me(self) -> dict:
        return self._call("GET", "me", fields="id,username")

    # ---- 投稿 ----
    def create_text_container(self, text: str) -> str:
        if len(text) > MAX_TEXT_LENGTH:
            raise ThreadsAPIError(f"Threadsの投稿は{MAX_TEXT_LENGTH}文字までです（現在{len(text)}文字）。")
        res = self._call("POST", "me/threads", media_type="TEXT", text=text)
        if "id" not in res:
            raise ThreadsAPIError(f"投稿の準備（コンテナ作成）に失敗しました：{res}")
        return str(res["id"])

    def publish(self, container_id: str) -> str:
        res = self._call("POST", "me/threads_publish", creation_id=container_id)
        if "id" not in res:
            raise ThreadsAPIError(f"投稿の公開に失敗しました：{res}")
        return str(res["id"])

    def get_post(self, media_id: str) -> dict:
        return self._call("GET", media_id, fields=POST_FIELDS)

    def list_posts(self, limit: int = 100) -> list[dict]:
        posts: list[dict] = []
        res = self._call("GET", "me/threads", fields=POST_FIELDS, limit=min(limit, 100))
        while True:
            posts.extend(res.get("data", []))
            nxt = res.get("paging", {}).get("cursors", {}).get("after")
            if len(posts) >= limit or not nxt or not res.get("paging", {}).get("next"):
                return posts[:limit]
            res = self._call("GET", "me/threads", fields=POST_FIELDS, limit=min(limit - len(posts), 100), after=nxt)

    # ---- 分析 ----
    def media_insights(self, media_id: str) -> dict[str, int]:
        res = self._call("GET", f"{media_id}/insights", metric=",".join(INSIGHT_METRICS))
        out: dict[str, int] = {}
        for item in res.get("data", []):
            values = item.get("values") or []
            if values:
                out[item.get("name", "")] = int(values[0].get("value", 0) or 0)
            elif "total_value" in item:
                out[item.get("name", "")] = int(item["total_value"].get("value", 0) or 0)
        return out

    def follower_count(self) -> int | None:
        res = self._call("GET", "me/threads_insights", metric="followers_count")
        for item in res.get("data", []):
            if item.get("name") == "followers_count":
                tv = item.get("total_value") or {}
                if "value" in tv:
                    return int(tv["value"])
                values = item.get("values") or []
                if values:
                    return int(values[-1].get("value", 0))
        return None

    def publishing_limit(self) -> tuple[int, int] | None:
        res = self._call("GET", "me/threads_publishing_limit", fields="quota_usage,config")
        data = (res.get("data") or [{}])[0]
        if "quota_usage" not in data:
            return None
        return int(data["quota_usage"]), int((data.get("config") or {}).get("quota_total", 250))

    # ---- トークン ----
    def refresh_token(self) -> tuple[str, int]:
        """長期トークンを更新する（発行から24時間以上・期限内のトークンのみ）。新しいトークンと有効秒数を返す。"""
        root = self.base_url.split("/v")[0] if "/v" in self.base_url else self.base_url
        res = self.transport("GET", f"{root}/refresh_access_token", {"grant_type": "th_refresh_token", "access_token": self.access_token})
        if "access_token" not in res:
            raise ThreadsAPIError(f"トークンの更新に失敗しました：{res}")
        return str(res["access_token"]), int(res.get("expires_in", 0))
