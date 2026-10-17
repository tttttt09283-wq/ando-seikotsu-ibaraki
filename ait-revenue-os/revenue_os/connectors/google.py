"""Google（Search Console・Googleビジネスプロフィール）の読み取り。

仕様は Google 公式の API 定義（discovery document）で確認したもの：
- Search Console : POST https://searchconsole.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query
                   本文 startDate, endDate, dimensions, rowLimit … 結果 rows[].keys/clicks/impressions/ctr/position
                   サイト一覧 GET https://searchconsole.googleapis.com/webmasters/v3/sites
- ビジネスプロフィール : GET https://businessprofileperformance.googleapis.com/v1/locations/{id}:fetchMultiDailyMetricsTimeSeries
                   dailyMetrics（複数可）, dailyRange.startDate.year/month/day, dailyRange.endDate.year/month/day
                   アカウント GET https://mybusinessaccountmanagement.googleapis.com/v1/accounts
                   店舗 GET https://mybusinessbusinessinformation.googleapis.com/v1/accounts/{id}/locations?readMask=name,title
ログインは「デスクトップアプリ」の OAuth（ブラウザでGoogleにログイン → このパソコンに戻る）。
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, timedelta
from urllib.parse import quote

from . import secrets_store

SCOPES = [
    "https://www.googleapis.com/auth/webmasters.readonly",
    "https://www.googleapis.com/auth/business.manage",
]
CLIENT_FILE = "google_client.json"
TOKEN_FILE = "google_token.json"

GBP_METRICS = {
    "search_views": ["BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", "BUSINESS_IMPRESSIONS_MOBILE_SEARCH"],
    "map_views": ["BUSINESS_IMPRESSIONS_DESKTOP_MAPS", "BUSINESS_IMPRESSIONS_MOBILE_MAPS"],
    "directions": ["BUSINESS_DIRECTION_REQUESTS"],
    "calls": ["CALL_CLICKS"],
    "website_clicks": ["WEBSITE_CLICKS"],
}

# (method, url, params, json_body) -> dict
Requester = Callable[[str, str, dict | None, dict | None], dict]


class GoogleError(Exception):
    """利用者に表示できる日本語のエラー。"""


def has_client() -> bool:
    return secrets_store.load_json(CLIENT_FILE) is not None


def is_logged_in() -> bool:
    return secrets_store.load_json(TOKEN_FILE) is not None


def save_client_file(raw: dict) -> None:
    if "installed" not in raw:
        raise GoogleError("「デスクトップアプリ」用の OAuth クライアントのJSONを選んでください（中に \"installed\" が含まれるもの）。")
    secrets_store.save_json(CLIENT_FILE, raw)


def login_in_browser() -> None:
    """ブラウザで Google にログインする（このパソコンでのみ動く）。"""
    from google_auth_oauthlib.flow import InstalledAppFlow

    client = secrets_store.load_json(CLIENT_FILE)
    if not client:
        raise GoogleError("先に OAuth クライアントのJSONを登録してください。")
    flow = InstalledAppFlow.from_client_config(client, SCOPES)
    creds = flow.run_local_server(port=0, open_browser=True, timeout_seconds=300, success_message="A.I.T Revenue OS との連携が完了しました。このウィンドウを閉じてアプリに戻ってください。")
    secrets_store.save_json(TOKEN_FILE, {"token": creds.token, "refresh_token": creds.refresh_token, "token_uri": creds.token_uri, "client_id": creds.client_id, "client_secret": creds.client_secret, "scopes": list(creds.scopes or SCOPES)})


def logout() -> None:
    secrets_store.delete(TOKEN_FILE)


def default_requester() -> Requester:
    from google.auth.transport.requests import AuthorizedSession, Request
    from google.oauth2.credentials import Credentials

    info = secrets_store.load_json(TOKEN_FILE)
    if not info:
        raise GoogleError("Google にログインしていません。")
    creds = Credentials.from_authorized_user_info(info, SCOPES)
    if not creds.valid:
        creds.refresh(Request())
        info["token"] = creds.token
        secrets_store.save_json(TOKEN_FILE, info)
    session = AuthorizedSession(creds)

    def call(method: str, url: str, params: dict | None, body: dict | None) -> dict:
        res = session.request(method, url, params=params, json=body, timeout=30)
        if res.status_code >= 400:
            try:
                msg = res.json().get("error", {}).get("message", res.text)
            except ValueError:
                msg = res.text
            if res.status_code == 429 or "quota" in msg.lower():
                raise GoogleError(f"Googleの利用枠の上限です（ビジネスプロフィールAPIは、Googleへの利用申請が必要な場合があります）：{msg}")
            if res.status_code in (401, 403):
                raise GoogleError(f"Googleの権限がありません（APIの有効化・ログインのやり直しが必要かもしれません）：{msg}")
            raise GoogleError(f"Google APIエラー（{res.status_code}）：{msg}")
        return res.json() if res.content else {}

    return call


@dataclass
class GoogleClient:
    request: Requester

    # ---- Search Console ----
    def list_sites(self) -> list[str]:
        res = self.request("GET", "https://searchconsole.googleapis.com/webmasters/v3/sites", None, None)
        return [s["siteUrl"] for s in res.get("siteEntry", []) if s.get("permissionLevel") != "siteUnverifiedUser"]

    def search_analytics(self, site: str, start: date, end: date, dimensions: list[str] | None = None, row_limit: int = 1000) -> list[dict]:
        url = f"https://searchconsole.googleapis.com/webmasters/v3/sites/{quote(site, safe='')}/searchAnalytics/query"
        body = {"startDate": start.isoformat(), "endDate": end.isoformat(), "rowLimit": row_limit}
        if dimensions:
            body["dimensions"] = dimensions
        return self.request("POST", url, None, body).get("rows", [])

    # ---- ビジネスプロフィール ----
    def list_locations(self) -> list[tuple[str, str]]:
        """（location名 'locations/123', 店舗名）の一覧。"""
        out = []
        accounts = self.request("GET", "https://mybusinessaccountmanagement.googleapis.com/v1/accounts", None, None).get("accounts", [])
        for acc in accounts:
            res = self.request("GET", f"https://mybusinessbusinessinformation.googleapis.com/v1/{acc['name']}/locations", {"readMask": "name,title", "pageSize": 100}, None)
            out += [(loc["name"], loc.get("title", loc["name"])) for loc in res.get("locations", [])]
        return out

    def gbp_daily(self, location: str, start: date, end: date, metrics: list[str]) -> dict[str, int]:
        params: dict = {"dailyMetrics": metrics}
        for prefix, d in (("dailyRange.startDate", start), ("dailyRange.endDate", end)):
            params[f"{prefix}.year"], params[f"{prefix}.month"], params[f"{prefix}.day"] = d.year, d.month, d.day
        res = self.request("GET", f"https://businessprofileperformance.googleapis.com/v1/{location}:fetchMultiDailyMetricsTimeSeries", params, None)
        totals = {m: 0 for m in metrics}
        for multi in res.get("multiDailyMetricTimeSeries", []):
            for series in multi.get("dailyMetricTimeSeries", []):
                m = series.get("dailyMetric")
                for dv in series.get("timeSeries", {}).get("datedValues", []):
                    totals[m] = totals.get(m, 0) + int(dv.get("value", 0) or 0)
        return totals


def week_range(today: date, delay_days: int) -> tuple[date, date]:
    """データの反映遅れを考慮した「直近7日間」。"""
    end = today - timedelta(days=delay_days)
    return end - timedelta(days=6), end
