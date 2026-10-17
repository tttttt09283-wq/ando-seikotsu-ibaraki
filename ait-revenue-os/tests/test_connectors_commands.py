from datetime import date, datetime, timedelta

import pytest

from revenue_os.acquisition import add_keyword, keyword_rows, metric_values
from revenue_os.commands import classify, run_command
from revenue_os.connectors import google as g
from revenue_os.connectors import secrets_store
from revenue_os.connectors.instagram import InstagramClient, InstagramError
from revenue_os.connectors.sync import connection_status, sync_all
from revenue_os.models import Content, Review
from revenue_os.seed import seed_sample
from revenue_os.threads_analytics import set_setting

TODAY = date(2026, 10, 17)


class FakeGoogle:
    def __init__(self):
        self.calls = []

    def __call__(self, method, url, params, body):
        self.calls.append((method, url, params, body))
        if url.endswith("/webmasters/v3/sites"):
            return {"siteEntry": [{"siteUrl": "https://example.com/", "permissionLevel": "siteOwner"}, {"siteUrl": "https://x.com/", "permissionLevel": "siteUnverifiedUser"}]}
        if "searchAnalytics/query" in url:
            if body.get("dimensions") == ["query"]:
                return {"rows": [{"keys": ["確定申告 ai"], "clicks": 5, "impressions": 100, "position": 7.6}]}
            return {"rows": [{"clicks": 40, "impressions": 2000, "position": 12.34}]}
        if url.endswith("/v1/accounts"):
            return {"accounts": [{"name": "accounts/1"}]}
        if "/locations" in url and "fetchMulti" not in url:
            return {"locations": [{"name": "locations/9", "title": "テスト店"}]}
        if "fetchMultiDailyMetricsTimeSeries" in url:
            series = [{"dailyMetric": m, "timeSeries": {"datedValues": [{"date": {}, "value": "10"}, {"date": {}, "value": "5"}]}} for m in params["dailyMetrics"]]
            return {"multiDailyMetricTimeSeries": [{"dailyMetricTimeSeries": series}]}
        return {}


def test_google_client_shapes():
    fake = FakeGoogle()
    c = g.GoogleClient(fake)
    assert c.list_sites() == ["https://example.com/"]
    assert c.list_locations() == [("locations/9", "テスト店")]
    totals = c.gbp_daily("locations/9", TODAY - timedelta(days=6), TODAY, ["CALL_CLICKS", "WEBSITE_CLICKS"])
    assert totals == {"CALL_CLICKS": 15, "WEBSITE_CLICKS": 15}
    _, url, params, _ = fake.calls[-1]
    assert url == "https://businessprofileperformance.googleapis.com/v1/locations/9:fetchMultiDailyMetricsTimeSeries"
    assert params["dailyRange.startDate.day"] == 11 and params["dailyRange.endDate.month"] == 10
    c.search_analytics("https://example.com/", TODAY, TODAY)
    assert "sites/https%3A%2F%2Fexample.com%2F/searchAnalytics/query" in fake.calls[-1][1]


def test_sync_google_records_kpis_and_keyword_rank(session):
    set_setting(session, "gsc_site", "https://example.com/")
    set_setting(session, "gbp_location", "locations/9")
    add_keyword(session, "seo", "確定申告 AI")
    add_keyword(session, "seo", "表示なしの言葉")
    reports = sync_all(session, today=TODAY, google_client=g.GoogleClient(FakeGoogle()))
    assert [r.service for r in reports] == ["Search Console", "Googleビジネスプロフィール"] and all(r.ok for r in reports)
    seo = {m.label: m.value for m in metric_values(session, "seo", TODAY)}
    assert seo["クリック（7日）"] == 40 and seo["平均掲載順位"] == 12.3
    gbp = {m.label: m.value for m in metric_values(session, "gbp", TODAY)}
    assert gbp["マップでの表示（7日）"] == 30 and gbp["電話（7日）"] == 15
    rows = {r.keyword: r for r in keyword_rows(session, "seo")}
    assert rows["確定申告 AI"].rank == 8 and rows["表示なしの言葉"].rank is None and rows["表示なしの言葉"].last_check


class FakeIG:
    def __init__(self, missing=()):
        self.missing = set(missing)

    def __call__(self, url, params):
        if url.endswith("/me"):
            return {"username": "ait", "followers_count": 1234}
        if url.endswith("/me/insights"):
            if params["metric"] in self.missing:
                raise InstagramError("metric not supported")
            return {"data": [{"name": params["metric"], "total_value": {"value": 77}}]}
        return {}


def test_instagram_weekly_with_fallback_and_unavailable(session):
    c = InstagramClient("t", transport=FakeIG(missing={"website_clicks", "profile_links_taps"}))
    r = c.weekly(TODAY - timedelta(days=7), TODAY - timedelta(days=1))
    assert r.values == {"followers": 1234, "reach": 77, "profile_visits": 77}
    assert r.unavailable == ["link_taps"]
    reports = sync_all(session, today=TODAY, instagram_client=c)
    assert reports[0].ok and "取得できなかった指標" in reports[0].message
    ig = {m.label: m.value for m in metric_values(session, "instagram", TODAY)}
    assert ig["リーチ（7日）"] == 77 and ig["リンクのタップ（7日）"] is None


def test_secrets_are_private(session):
    secrets_store.save_json("x.json", {"a": 1})
    p = secrets_store.SECRETS_DIR / "x.json"
    assert oct(p.stat().st_mode & 0o777) == "0o600"
    with pytest.raises(g.GoogleError):
        g.save_client_file({"web": {}})


def test_connection_status_default(session):
    assert connection_status(session) == {"threads": False, "instagram": False, "seo": False, "gbp": False}


@pytest.mark.parametrize(
    "text,intent",
    [
        ("今日やることは？", "today"),
        ("数字を最新にして", "sync"),
        ("Threadsの投稿を3本作って", "threads_drafts"),
        ("口コミの返信案を作って", "review_replies"),
        ("集客を分析して", "analysis"),
        ("日次報告を作って", "daily_report"),
        ("おまかせでまとめてやって", "omakase"),
        ("承認待ちある？", "approvals"),
    ],
)
def test_classify(text, intent):
    assert classify(text) == intent


def test_run_commands(session):
    seed_sample(session)
    r = run_command(session, "Threadsの投稿を2本作って")
    assert r.title.startswith("Threads の下書きを2本")
    assert session.query(Content).filter_by(channel="threads", status="draft", ai_generated=True).count() >= 2
    r = run_command(session, "口コミの返信案を作って")
    assert all(x.reply_draft for x in session.query(Review).filter_by(replied=False))
    assert not any(x.replied for x in session.query(Review) if "（サンプル）待ち時間" in x.text)  # 返信の送信はしない
    r = run_command(session, "数字を最新にして")
    assert not r.ok and r.links[0][0] == "connect"  # 未接続なら連携設定へ案内
    r = run_command(session, "おまかせでまとめてやって")
    assert r.intent == "omakase" and any("日次報告" in l for l in r.lines)
    assert run_command(session, "宇宙の話をして").intent == "help"
