from datetime import date, datetime, timedelta
from types import SimpleNamespace

from revenue_os.ai import client as ai_client
from revenue_os.ai.generators import RESEARCH_SCHEMA, research_hypotheses, sns_drafts
from revenue_os.kpi import compute_kpi, daily_revenue
from revenue_os.models import AIUsage, ChannelMetric, DailyReport, Expense, SalesRecord, Task
from revenue_os.report import generate_daily_report
from revenue_os.seed import delete_sample, has_sample, seed_sample


def _sale(session, source, d, gross, fee, rev, key, sample=False):
    session.add(SalesRecord(source=source, order_date=d, gross_yen=gross, fee_yen=fee, revenue_yen=rev, dedupe_key=key, is_sample=sample))


def test_kpi_separates_and_combines_sources(session):
    d = date(2026, 10, 10)
    _sale(session, "note", d, 1000, 150, 850, "a")
    _sale(session, "note", d, 500, 75, 425, "b")
    _sale(session, "rakuten", d, 5000, 0, 50, "c")
    session.add(Expense(expense_date=d, category="その他", amount_yen=300))
    session.add(AIUsage(role="チャド", purpose="t", mode="api", cost_yen=12.5, created_at=datetime(2026, 10, 10, 9)))
    session.add(ChannelMetric(metric_date=d, channel="note", impressions=1000, clicks=20, conversions=2))
    session.flush()
    k = compute_kpi(session, d, d)
    assert (k.note.revenue_yen, k.rakuten.revenue_yen, k.revenue_yen, k.orders) == (1275, 50, 1325, 3)
    assert k.cost_yen == 312.5 and k.gross_profit_yen == 1012.5
    assert k.ctr == 0.02 and k.cvr == 0.1
    # 期間外は含まない
    assert compute_kpi(session, d + timedelta(days=1), d + timedelta(days=2)).revenue_yen == 0


def test_kpi_excludes_sample_and_handles_zero(session):
    d = date(2026, 10, 10)
    _sale(session, "note", d, 1000, 0, 1000, "s", sample=True)
    session.flush()
    assert compute_kpi(session, d, d, include_sample=True).revenue_yen == 1000
    k = compute_kpi(session, d, d, include_sample=False)
    assert k.revenue_yen == 0 and k.ctr is None and k.cvr is None
    df = daily_revenue(session, d - timedelta(days=2), d)
    assert len(df) == 3 and df["note"].sum() == 1000


def test_template_mode_without_api_key(session):
    res = research_hypotheses(session, "テーマ", "読者", "課題")
    assert res.mode == "template" and res.data["hypotheses"]
    assert all("http" not in h for h in res.data["hypotheses"])  # URLを作らない
    usage = session.query(AIUsage).one()
    assert usage.mode == "template" and usage.cost_yen == 0


def test_affiliate_drafts_include_pr(session):
    res = sns_drafts(session, "商品", "", ["x", "threads"], affiliate=True)
    assert all(d["body"].startswith("【PR】") for d in res.data["drafts"])


class _FakeMessages:
    def __init__(self, stop_reason="end_turn", text='{"hypotheses":["h"],"verify_questions":[],"search_keywords":[]}'):
        self.calls = []
        self.stop_reason, self.text = stop_reason, text

    def create(self, **kw):
        self.calls.append(kw)
        return SimpleNamespace(
            model=kw["model"],
            stop_reason=self.stop_reason,
            content=[SimpleNamespace(type="text", text=self.text)],
            usage=SimpleNamespace(input_tokens=1000, output_tokens=500),
        )


def _fake_client(**kw):
    msgs = _FakeMessages(**kw)
    return SimpleNamespace(beta=SimpleNamespace(messages=msgs)), msgs


def test_api_mode_records_cost_and_sends_schema(session):
    client, msgs = _fake_client()
    res = research_hypotheses(session, "テーマ", "", "", client=client)
    assert res.mode == "api" and res.data["hypotheses"] == ["h"]
    call = msgs.calls[0]
    assert call["output_config"]["format"]["schema"] == RESEARCH_SCHEMA
    assert call["model"] == "claude-opus-5-5" and call["fallbacks"] == "default"
    usage = session.query(AIUsage).one()
    # 1000×$4/M + 500×$20/M = $0.014 → ×150 = ¥2.1
    assert usage.mode == "api" and abs(usage.cost_yen - 2.1) < 1e-9


def test_refusal_and_bad_json_fall_back_to_template(session):
    for kw in ({"stop_reason": "refusal"}, {"text": "not json"}, {"stop_reason": "max_tokens"}):
        client, _ = _fake_client(**kw)
        res = research_hypotheses(session, "テーマ", "", "", client=client)
        assert res.mode == "template" and res.data["hypotheses"]


def test_daily_budget_blocks_api(session, monkeypatch):
    monkeypatch.setenv("AIT_AI_DAILY_BUDGET_YEN", "1")
    session.add(AIUsage(role="チャド", purpose="x", mode="api", cost_yen=5.0))
    session.flush()
    client, msgs = _fake_client()
    res = research_hypotheses(session, "テーマ", "", "", client=client)
    assert res.mode == "template" and not msgs.calls and "予算" in res.notice


def test_daily_report_separates_facts_and_suggestions(session):
    seed_sample(session)
    report, _ = generate_daily_report(session, date.today())
    assert "受取額" in report.facts_md and "【仮説】" in report.suggestions_md
    assert "【仮説】" not in report.facts_md
    assert session.query(DailyReport).count() == 1
    n_tasks = session.query(Task).count()
    generate_daily_report(session, date.today())
    assert session.query(Task).count() == n_tasks  # 同じタスクは重複登録しない


def test_seed_is_idempotent_and_deletable(session):
    assert seed_sample(session) is True
    assert seed_sample(session) is False
    assert session.query(SalesRecord).filter_by(is_sample=True).count() == 6
    delete_sample(session)
    session.flush()
    assert not has_sample(session) and session.query(SalesRecord).count() == 0
