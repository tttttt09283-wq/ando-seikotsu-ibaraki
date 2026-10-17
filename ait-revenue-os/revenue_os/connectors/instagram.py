"""Instagram（プロアカウント）のインサイト読み取り。

Meta の仕様は変更が多い（例：2025年に impressions が views に置き換え）。指標名は複数の候補を順に試し、
取得できなかった指標は「取得不可」として記録する（推測の値は作らない）。
接続先は .env の INSTAGRAM_API_BASE で変更できる（既定 https://graph.instagram.com）。
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime, time

# アプリの指標 → Instagram の指標名の候補（先頭から試す）
METRIC_CANDIDATES = {
    "reach": ["reach"],
    "profile_visits": ["profile_views"],
    "link_taps": ["website_clicks", "profile_links_taps"],
}

Transport = Callable[[str, dict], dict]


class InstagramError(Exception):
    pass


def _default_transport(url: str, params: dict) -> dict:
    try:
        with urllib.request.urlopen(f"{url}?{urllib.parse.urlencode(params)}", timeout=30) as res:  # noqa: S310 - 公式APIのみ
            return json.loads(res.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read().decode()).get("error", {}).get("message", str(e))
        except Exception:  # noqa: BLE001
            msg = str(e)
        raise InstagramError(f"Instagram APIエラー（{e.code}）：{msg}") from e
    except urllib.error.URLError as e:
        raise InstagramError(f"Instagramに接続できませんでした：{e.reason}") from e


@dataclass
class InstagramResult:
    values: dict[str, float] = field(default_factory=dict)
    unavailable: list[str] = field(default_factory=list)
    username: str = ""


@dataclass
class InstagramClient:
    access_token: str
    base_url: str = "https://graph.instagram.com"
    transport: Transport = _default_transport

    def _get(self, path: str, **params) -> dict:
        params["access_token"] = self.access_token
        return self.transport(f"{self.base_url.rstrip('/')}/{path}", params)

    def profile(self) -> dict:
        return self._get("me", fields="user_id,username,followers_count")

    def _metric_total(self, metric: str, since: date, until: date) -> float:
        res = self._get(
            "me/insights",
            metric=metric,
            period="day",
            metric_type="total_value",
            since=int(datetime.combine(since, time.min).timestamp()),
            until=int(datetime.combine(until, time.max).timestamp()),
        )
        for item in res.get("data", []):
            tv = item.get("total_value")
            if tv and "value" in tv:
                return float(tv["value"])
            vals = item.get("values") or []
            if vals:
                return float(sum(float(v.get("value", 0) or 0) for v in vals))
        raise InstagramError(f"{metric} の値が返されませんでした")

    def weekly(self, since: date, until: date) -> InstagramResult:
        r = InstagramResult()
        prof = self.profile()
        r.username = prof.get("username", "")
        if "followers_count" in prof:
            r.values["followers"] = float(prof["followers_count"])
        for key, names in METRIC_CANDIDATES.items():
            for name in names:
                try:
                    r.values[key] = self._metric_total(name, since, until)
                    break
                except InstagramError:
                    continue
            else:
                r.unavailable.append(key)
        return r

    def refresh_token(self) -> tuple[str, int]:
        res = self.transport(f"{self.base_url.rstrip('/')}/refresh_access_token", {"grant_type": "ig_refresh_token", "access_token": self.access_token})
        if "access_token" not in res:
            raise InstagramError(f"トークンの更新に失敗しました：{res}")
        return res["access_token"], int(res.get("expires_in", 0))
