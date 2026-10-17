"""連携サービスから数字をまとめて取得する（読み取りのみ）。"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy.orm import Session

from ..acquisition import add_check, keyword_rows, record_kpis
from ..config import get_settings
from ..models import SearchKeyword
from ..threads_analytics import get_setting, set_setting, sync_threads
from ..threads_scheduler import make_api
from . import google as g
from .instagram import InstagramClient, InstagramError

SEARCH_CONSOLE_DELAY = 3  # Search Console は数日遅れて反映される
GBP_DELAY = 3


@dataclass
class SyncReport:
    service: str
    ok: bool
    message: str


def connection_status(session: Session) -> dict[str, bool]:
    s = get_settings()
    logged_in = g.is_logged_in()
    return {
        "threads": s.threads_connected,
        "instagram": bool(s.instagram_access_token),
        "seo": logged_in and bool(get_setting(session, "gsc_site")),
        "gbp": logged_in and bool(get_setting(session, "gbp_location")),
    }


def sync_instagram(session: Session, client: InstagramClient, today: date) -> SyncReport:
    since, until = g.week_range(today, 1)
    try:
        r = client.weekly(since, until)
    except InstagramError as e:
        return SyncReport("Instagram", False, str(e))
    n = record_kpis(session, "instagram", today, r.values)
    msg = f"@{r.username} の数字を{n}件取得"
    if r.unavailable:
        msg += f"（取得できなかった指標：{'、'.join(r.unavailable)}。仕様変更の可能性があるため手入力してください）"
    return SyncReport("Instagram", True, msg)


def sync_search_console(session: Session, client: g.GoogleClient, site: str, today: date) -> SyncReport:
    start, end = g.week_range(today, SEARCH_CONSOLE_DELAY)
    try:
        total = client.search_analytics(site, start, end)
        by_query = client.search_analytics(site, start, end, ["query"], row_limit=5000)
    except g.GoogleError as e:
        return SyncReport("Search Console", False, str(e))
    row = total[0] if total else {"impressions": 0, "clicks": 0, "position": None}
    values = {"impressions": float(row.get("impressions", 0)), "clicks": float(row.get("clicks", 0))}
    if row.get("position"):
        values["avg_position"] = round(float(row["position"]), 1)
    record_kpis(session, "seo", today, values)
    positions = {r["keys"][0].strip().lower(): r for r in by_query if r.get("keys")}
    updated = 0
    for kw in keyword_rows(session, "seo"):
        hit = positions.get(kw.keyword.strip().lower())
        if kw.last_check and kw.last_check.date() == today:
            continue
        k = session.get(SearchKeyword, kw.id)
        add_check(session, k, rank=max(1, round(hit["position"])) if hit else None, engine="Search Console", memo=f"{start:%m/%d}〜{end:%m/%d}の平均順位" if hit else f"{start:%m/%d}〜{end:%m/%d}に表示なし")
        updated += 1
    return SyncReport("Search Console", True, f"{start:%m/%d}〜{end:%m/%d}：表示 {values['impressions']:,.0f}回・クリック {values['clicks']:,.0f}回／キーワード順位 {updated}件を更新")


def sync_gbp(session: Session, client: g.GoogleClient, location: str, today: date) -> SyncReport:
    start, end = g.week_range(today, GBP_DELAY)
    metrics = sorted({m for ms in g.GBP_METRICS.values() for m in ms})
    try:
        totals = client.gbp_daily(location, start, end, metrics)
    except g.GoogleError as e:
        return SyncReport("Googleビジネスプロフィール", False, str(e))
    values = {key: float(sum(totals.get(m, 0) for m in ms)) for key, ms in g.GBP_METRICS.items()}
    record_kpis(session, "gbp", today, values)
    return SyncReport("Googleビジネスプロフィール", True, f"{start:%m/%d}〜{end:%m/%d}：マップ表示 {values['map_views']:,.0f}・検索表示 {values['search_views']:,.0f}・ルート {values['directions']:,.0f}・電話 {values['calls']:,.0f}")


def sync_all(session: Session, today: date | None = None, google_client: g.GoogleClient | None = None, instagram_client: InstagramClient | None = None) -> list[SyncReport]:
    """接続済みのサービスから、まとめて数字を取得する。"""
    today = today or date.today()
    s = get_settings()
    reports: list[SyncReport] = []
    api = make_api(s)
    if api:
        r = sync_threads(session, api)
        reports.append(SyncReport("Threads", not r.errors, f"新しい投稿 {r.new_posts}件・反応数 {r.updated_insights}件" + (f"（{r.errors[0]}）" if r.errors else "")))
    if instagram_client or s.instagram_access_token:
        reports.append(sync_instagram(session, instagram_client or InstagramClient(s.instagram_access_token, s.instagram_api_base), today))
    site, location = get_setting(session, "gsc_site"), get_setting(session, "gbp_location")
    if (site or location) and (google_client or g.is_logged_in()):
        try:
            client = google_client or g.GoogleClient(g.default_requester())
        except g.GoogleError as e:
            reports.append(SyncReport("Google", False, str(e)))
        else:
            if site:
                reports.append(sync_search_console(session, client, site, today))
            if location:
                reports.append(sync_gbp(session, client, location, today))
    set_setting(session, "last_sync_all", datetime.now().isoformat(timespec="seconds"))
    return reports
