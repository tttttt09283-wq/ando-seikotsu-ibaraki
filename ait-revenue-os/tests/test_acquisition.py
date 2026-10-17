from datetime import date, datetime, timedelta

import pytest

from revenue_os.acquisition import (
    acquisition_facts,
    add_check,
    add_keyword,
    add_review,
    aio_mention_rate,
    channel_statuses,
    keyword_rows,
    mark_replied,
    metric_values,
    record_kpis,
    review_stats,
    set_enabled_channels,
)
from revenue_os.ai.generators import acquisition_analysis, review_reply
from revenue_os.quality import check_content
from revenue_os.seed import delete_sample, seed_sample
from revenue_os.today import build_today

T = date(2026, 10, 17)


def test_record_and_delta(session):
    record_kpis(session, "instagram", T - timedelta(days=7), {"reach": 1000, "followers": 500})
    record_kpis(session, "instagram", T, {"reach": 1300, "followers": None})
    mv = {m.label: m for m in metric_values(session, "instagram", T)}
    assert mv["リーチ（7日）"].value == 1300 and round(mv["リーチ（7日）"].delta_pct) == 30
    assert mv["フォロワー"].value == 500  # 空欄は記録しない
    record_kpis(session, "instagram", T, {"reach": 1200})  # 同じ日は上書き
    assert {m.label: m for m in metric_values(session, "instagram", T)}["リーチ（7日）"].value == 1200
    with pytest.raises(ValueError):
        record_kpis(session, "instagram", T, {"reach": -1})


def test_auto_metrics_cannot_be_overwritten(session):
    assert record_kpis(session, "note", T, {"sales": 999, "page_views": 10}) == 1


def test_lower_is_better_for_rank(session):
    record_kpis(session, "seo", T - timedelta(days=7), {"avg_position": 20})
    record_kpis(session, "seo", T, {"avg_position": 15})
    m = {x.label: x for x in metric_values(session, "seo", T)}["平均掲載順位"]
    assert m.improving is True


def test_channel_issues_and_enabled(session):
    set_enabled_channels(session, ["instagram", "x"])
    record_kpis(session, "x", date.today() - timedelta(days=7), {"impressions": 1000})
    record_kpis(session, "x", date.today(), {"impressions": 500})
    st = {c.cdef.key: c for c in channel_statuses(session)}
    assert set(st) == {"instagram", "x"}
    assert st["instagram"].stale and st["instagram"].issues
    assert any("悪化" in i for i in st["x"].issues)


def test_reviews(session):
    r1 = add_review(session, "google", T, 2, "待ち時間が長い")
    add_review(session, "google", T, 5, "良かった")
    s = review_stats(session)
    assert (s.count, s.average, s.unreplied, s.low_unreplied) == (2, 3.5, 2, 1)
    with pytest.raises(ValueError):
        mark_replied(session, r1, "")
    mark_replied(session, r1, "ご意見ありがとうございます。")
    assert review_stats(session).low_unreplied == 0
    with pytest.raises(ValueError):
        add_review(session, "google", T, 6, "x")


def test_review_reply_template_is_safe(session):
    res = review_reply(session, 2, "待ち時間が長い", "テスト店")
    assert res.mode == "template" and "ありがとうございます" in res.data["reply"]
    assert not [f for f in check_content("gbp", "", res.data["reply"]) if f.severity == "要修正"]


def test_search_tracking_and_aio_rate(session):
    k = add_keyword(session, "seo", "kw")
    add_check(session, k, rank=10, checked_at=datetime.now() - timedelta(days=3))
    add_check(session, k, rank=14)
    a1 = add_keyword(session, "aio", "質問1")
    a2 = add_keyword(session, "aio", "質問2")
    with pytest.raises(ValueError):
        add_check(session, a1)  # 言及の有無が必要
    add_check(session, a1, mentioned=True)
    add_check(session, a2, mentioned=False)
    assert aio_mention_rate(session, date.today()) == 50.0
    rows = {r.keyword: r for r in keyword_rows(session)}
    assert rows["kw"].rank == 14 and rows["kw"].prev_rank == 10
    facts = acquisition_facts(session)
    assert any("順位が下がった" in i for i in facts["issues"]) and any("AI検索で言及されていない" in i for i in facts["issues"])


def test_analysis_template_and_today_and_seed(session):
    seed_sample(session)
    facts = acquisition_facts(session)
    res = acquisition_analysis(session, facts)
    assert res.mode == "template" and res.data["improvements"]
    titles = " ".join(i.title for i in build_today(session).items)
    assert "口コミ" in titles
    delete_sample(session)
    session.flush()
    assert review_stats(session).count == 0 and not keyword_rows(session)
