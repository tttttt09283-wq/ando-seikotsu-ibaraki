from datetime import datetime, timedelta

import pytest

from revenue_os.config import Settings
from revenue_os.models import STATUS_PUBLISHED, Content, ScheduledPost, ThreadsPost
from revenue_os.quality import checklist_for
from revenue_os.threads_analytics import add_manual_post, analysis_facts, feature_table, funnel_rows, posts_frame, set_funnel_check, sync_threads
from revenue_os.threads_api import ThreadsAPI, ThreadsAPIError, parse_timestamp
from revenue_os.threads_scheduler import cancel_schedule, run_due, schedule_post
from revenue_os.today import build_today
from revenue_os.workflow import HUMAN_ACTOR, WorkflowError, approve, create_content, submit_for_review
from revenue_os.seed import seed_sample


class FakeThreads:
    """Threads API の偽物。呼ばれた操作を記録する（実際の通信はしない）。"""

    def __init__(self, fail_publish=0):
        self.calls = []
        self.fail_publish = fail_publish
        self.n = 0

    def __call__(self, method, url, params):
        path = url.split("/v1.0/")[-1] if "/v1.0/" in url else url
        self.calls.append((method, path, dict(params)))
        if method == "POST" and path == "me/threads":
            self.n += 1
            return {"id": f"c{self.n}"}
        if method == "POST" and path == "me/threads_publish":
            if self.fail_publish:
                self.fail_publish -= 1
                raise ThreadsAPIError("一時的なエラー")
            return {"id": f"m-{params['creation_id']}"}
        if method == "GET" and path.startswith("m-") and "/insights" not in path:
            return {"id": path, "permalink": f"https://www.threads.net/@ait/post/{path}", "timestamp": "2026-10-17T12:00:00+0000"}
        if path == "me/threads":
            return {"data": [{"id": "p1", "text": "伸びた投稿？", "timestamp": "2026-10-16T12:00:00+0000", "permalink": "https://www.threads.net/@ait/post/p1", "media_type": "TEXT"}, {"id": "r1", "media_type": "REPOST_FACADE"}]}
        if path.endswith("/insights"):
            return {"data": [{"name": "views", "values": [{"value": 1200}]}, {"name": "likes", "values": [{"value": 30}]}]}
        if path == "me/threads_insights":
            return {"data": [{"name": "followers_count", "total_value": {"value": 900}}]}
        return {}

    def count(self, method, path):
        return sum(1 for m, p, _ in self.calls if m == method and p == path)


def _settings(**kw):
    base = dict(anthropic_api_key=None, model="m", ai_daily_budget_yen=0, usd_jpy=150, db_path=":memory:", threads_access_token="t", threads_posting_enabled=True, threads_daily_limit=5, threads_min_interval_min=60, threads_publish_wait_sec=0)
    base.update(kw)
    return Settings(**base)


def _approved(session, body="今日の気づきをまとめました。"):
    c = create_content(session, "threads", "", body)
    submit_for_review(session, c, HUMAN_ACTOR)
    approve(session, c, HUMAN_ACTOR, {k: True for k, _ in checklist_for(c.channel, c.body, False, False)})
    session.flush()
    return c


NOW = datetime(2026, 10, 17, 21, 0)


def test_parse_timestamp_converts_to_local_naive():
    dt = parse_timestamp("2026-10-17T12:00:00+0000")
    assert dt.tzinfo is None


def test_text_limit_enforced():
    with pytest.raises(ThreadsAPIError):
        ThreadsAPI("t", transport=FakeThreads()).create_text_container("あ" * 501)


def test_only_approved_threads_content_can_be_scheduled(session):
    draft = create_content(session, "threads", "", "下書き")
    with pytest.raises(WorkflowError):
        schedule_post(session, draft, NOW, HUMAN_ACTOR, now=NOW)
    c = _approved(session)
    with pytest.raises(WorkflowError):
        schedule_post(session, c, NOW, "マーケティングAI", now=NOW)  # AIは予約できない
    schedule_post(session, c, NOW, HUMAN_ACTOR, now=NOW)
    with pytest.raises(WorkflowError):
        schedule_post(session, c, NOW, HUMAN_ACTOR, now=NOW)  # 二重予約


def test_publishes_due_post_and_records(session):
    c = _approved(session)
    schedule_post(session, c, NOW, HUMAN_ACTOR, now=NOW)
    fake = FakeThreads()
    res = run_due(session, ThreadsAPI("t", transport=fake), now=NOW, settings=_settings())
    assert [r.outcome for r in res] == ["published"]
    assert fake.count("POST", "me/threads") == 1 and fake.count("POST", "me/threads_publish") == 1
    sent = next(p for m, path, p in fake.calls if path == "me/threads")
    assert sent["media_type"] == "TEXT" and sent["text"] == c.body
    session.refresh(c)
    assert c.status == STATUS_PUBLISHED and c.public_url.startswith("https://www.threads.net/")
    assert session.query(ThreadsPost).filter_by(source="scheduled").count() == 1
    # もう一度動かしても二重投稿しない
    assert run_due(session, ThreadsAPI("t", transport=fake), now=NOW + timedelta(hours=2), settings=_settings()) == []
    assert fake.count("POST", "me/threads_publish") == 1


def test_nothing_posted_when_switch_off_or_not_due(session):
    c = _approved(session)
    schedule_post(session, c, NOW + timedelta(hours=1), HUMAN_ACTOR, now=NOW)
    fake = FakeThreads()
    assert run_due(session, ThreadsAPI("t", transport=fake), now=NOW, settings=_settings()) == []  # まだ時刻前
    res = run_due(session, ThreadsAPI("t", transport=fake), now=NOW + timedelta(hours=1), settings=_settings(threads_posting_enabled=False))
    assert res[0].outcome == "skipped" and not fake.calls


def test_retry_reuses_container_no_duplicate(session):
    c = _approved(session)
    schedule_post(session, c, NOW, HUMAN_ACTOR, now=NOW)
    fake = FakeThreads(fail_publish=1)
    api = ThreadsAPI("t", transport=fake)
    assert run_due(session, api, now=NOW, settings=_settings())[0].outcome == "retry"
    sp = session.query(ScheduledPost).one()
    assert sp.container_id == "c1" and sp.status == "scheduled"
    assert run_due(session, api, now=NOW + timedelta(minutes=10), settings=_settings())[0].outcome == "published"
    assert fake.count("POST", "me/threads") == 1  # コンテナは作り直さない
    assert fake.calls[-3][2]["creation_id"] == "c1" or any(p.get("creation_id") == "c1" for _, path, p in fake.calls if path == "me/threads_publish")


def test_daily_limit_and_interval(session):
    c1, c2, c3 = _approved(session, "投稿1"), _approved(session, "投稿2"), _approved(session, "投稿3")
    for c in (c1, c2, c3):
        schedule_post(session, c, NOW, HUMAN_ACTOR, now=NOW)
    fake = FakeThreads()
    api = ThreadsAPI("t", transport=fake)
    s = _settings(threads_daily_limit=2, threads_min_interval_min=60)
    assert [r.outcome for r in run_due(session, api, now=NOW, settings=s)] == ["published"]  # 1回1件
    assert run_due(session, api, now=NOW + timedelta(minutes=30), settings=s)[0].outcome == "skipped"  # 間隔
    assert run_due(session, api, now=NOW + timedelta(minutes=61), settings=s)[0].outcome == "published"
    r = run_due(session, api, now=NOW + timedelta(minutes=130), settings=s)
    assert r[0].outcome == "skipped" and "上限" in r[0].message  # 1日2件まで
    assert fake.count("POST", "me/threads_publish") == 2


def test_duplicate_text_blocked(session):
    session.add(ThreadsPost(threads_id="old", text="同じ本文", posted_at=NOW - timedelta(days=3), source="api"))
    c = _approved(session, "同じ本文")
    schedule_post(session, c, NOW, HUMAN_ACTOR, now=NOW)
    fake = FakeThreads()
    r = run_due(session, ThreadsAPI("t", transport=fake), now=NOW, settings=_settings())
    assert r[0].outcome == "failed" and "同じ本文" in r[0].message and not fake.calls


def test_cancel(session):
    c = _approved(session)
    sp = schedule_post(session, c, NOW, HUMAN_ACTOR, now=NOW)
    cancel_schedule(session, sp, HUMAN_ACTOR)
    assert run_due(session, ThreadsAPI("t", transport=FakeThreads()), now=NOW, settings=_settings()) == []


def test_sync_and_analysis(session):
    fake = FakeThreads()
    r = sync_threads(session, ThreadsAPI("t", transport=fake), now=datetime(2026, 10, 17, 22))
    assert r.new_posts == 1 and r.updated_insights == 1 and r.followers == 900  # 再投稿は取り込まない
    # 6時間以内は再取得しない
    r2 = sync_threads(session, ThreadsAPI("t", transport=fake), now=datetime(2026, 10, 17, 23))
    assert r2.new_posts == 0 and r2.updated_insights == 0
    df = posts_frame(session)
    assert df.iloc[0]["views"] == 1200 and df.iloc[0]["問いかけ"] == "あり"


def test_feature_analysis_on_sample(session):
    seed_sample(session)
    df = posts_frame(session)
    facts = analysis_facts(df)
    assert facts["posts_with_insights"] == 8 and facts["top_posts"][0]["views"] == 3100
    t = feature_table(df, "時間帯")
    assert not t.empty and set(t.columns) >= {"件数", "平均閲覧", "参考値"}


def test_manual_post_and_funnel(session):
    seed_sample(session)
    add_manual_post(session, "手入力の投稿", "", NOW, {"views": 100, "likes": 5})
    rows = funnel_rows(session)
    f = rows[0]
    assert f.views_30d > 0 and 0 <= f.score <= 100
    before = f.score
    set_funnel_check(session, f.product_id, "profile_link", True)
    assert funnel_rows(session)[0].score > before


def test_today_plan_lists_actions(session):
    seed_sample(session)
    plan = build_today(session)
    titles = " ".join(i.title for i in plan.items)
    assert "承認待ち" in titles and "日次報告" in titles
    assert plan.items == sorted(plan.items, key=lambda x: (x.priority, 0 if x.role == "社長" else 1))
    c = _approved(session, "予約前の投稿")
    plan2 = build_today(session)
    assert any("予約する" in i.title for i in plan2.items)


def test_analysis_with_no_posts(session):
    from revenue_os.commands import run_command

    df = posts_frame(session)
    assert analysis_facts(df) == {"posts_with_insights": 0}
    assert feature_table(df, "時間帯").empty
    assert run_command(session, "Threadsの投稿を2本作って").title.startswith("Threads の下書きを2本")
