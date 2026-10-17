"""KPI 集計。すべてDBに保存された実データから計算する（推定値は作らない）。

定義:
- 売上（受取額）: note は 売上−手数料、楽天は 成果報酬額
- 費用: 経費 ＋ AI利用料
- 粗利益: 売上（受取額）合計 − 費用
- CTR: クリック数 ÷ 表示回数
- CVR: 成果件数 ÷ クリック数
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time

import pandas as pd
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import AIUsage, ChannelMetric, Expense, SalesRecord


@dataclass(frozen=True)
class SourceSummary:
    source: str
    orders: int
    gross_yen: int
    fee_yen: int
    revenue_yen: int


@dataclass(frozen=True)
class KPI:
    start: date
    end: date
    note: SourceSummary
    rakuten: SourceSummary
    expenses_yen: int
    ai_cost_yen: float
    impressions: int
    clicks: int
    conversions: int

    @property
    def revenue_yen(self) -> int:
        return self.note.revenue_yen + self.rakuten.revenue_yen

    @property
    def orders(self) -> int:
        return self.note.orders + self.rakuten.orders

    @property
    def cost_yen(self) -> float:
        return self.expenses_yen + self.ai_cost_yen

    @property
    def gross_profit_yen(self) -> float:
        return self.revenue_yen - self.cost_yen

    @property
    def ctr(self) -> float | None:
        return self.clicks / self.impressions if self.impressions else None

    @property
    def cvr(self) -> float | None:
        return self.conversions / self.clicks if self.clicks else None


def _source_summary(session: Session, source: str, start: date, end: date, include_sample: bool) -> SourceSummary:
    q = select(
        func.count(SalesRecord.id),
        func.coalesce(func.sum(SalesRecord.gross_yen), 0),
        func.coalesce(func.sum(SalesRecord.fee_yen), 0),
        func.coalesce(func.sum(SalesRecord.revenue_yen), 0),
    ).where(SalesRecord.source == source, SalesRecord.order_date.between(start, end))
    if not include_sample:
        q = q.where(SalesRecord.is_sample.is_(False))
    n, gross, fee, rev = session.execute(q).one()
    return SourceSummary(source, int(n), int(gross), int(fee), int(rev))


def compute_kpi(session: Session, start: date, end: date, include_sample: bool = True, channel: str | None = None) -> KPI:
    exp_q = select(func.coalesce(func.sum(Expense.amount_yen), 0)).where(Expense.expense_date.between(start, end))
    met_q = select(
        func.coalesce(func.sum(ChannelMetric.impressions), 0),
        func.coalesce(func.sum(ChannelMetric.clicks), 0),
        func.coalesce(func.sum(ChannelMetric.conversions), 0),
    ).where(ChannelMetric.metric_date.between(start, end))
    if channel:
        met_q = met_q.where(ChannelMetric.channel == channel)
    if not include_sample:
        exp_q = exp_q.where(Expense.is_sample.is_(False))
        met_q = met_q.where(ChannelMetric.is_sample.is_(False))
    ai_q = select(func.coalesce(func.sum(AIUsage.cost_yen), 0.0)).where(
        AIUsage.created_at.between(datetime.combine(start, time.min), datetime.combine(end, time.max))
    )
    imp, clk, conv = session.execute(met_q).one()
    return KPI(
        start=start,
        end=end,
        note=_source_summary(session, "note", start, end, include_sample),
        rakuten=_source_summary(session, "rakuten", start, end, include_sample),
        expenses_yen=int(session.scalar(exp_q) or 0),
        ai_cost_yen=float(session.scalar(ai_q) or 0.0),
        impressions=int(imp),
        clicks=int(clk),
        conversions=int(conv),
    )


def daily_revenue(session: Session, start: date, end: date, include_sample: bool = True) -> pd.DataFrame:
    """日別・販売元別の受取額（グラフ用）。データがない日は0で埋める。"""
    q = (
        select(SalesRecord.order_date, SalesRecord.source, func.sum(SalesRecord.revenue_yen))
        .where(SalesRecord.order_date.between(start, end))
        .group_by(SalesRecord.order_date, SalesRecord.source)
    )
    if not include_sample:
        q = q.where(SalesRecord.is_sample.is_(False))
    rows = session.execute(q).all()
    idx = pd.date_range(start, end, freq="D")
    df = pd.DataFrame(0, index=idx, columns=["note", "楽天"])
    for d, src, amount in rows:
        df.loc[pd.Timestamp(d), "note" if src == "note" else "楽天"] = int(amount or 0)
    df.index.name = "日付"
    return df


def ai_cost_today(session: Session, today: date | None = None) -> float:
    today = today or date.today()
    q = select(func.coalesce(func.sum(AIUsage.cost_yen), 0.0)).where(
        AIUsage.created_at.between(datetime.combine(today, time.min), datetime.combine(today, time.max))
    )
    return float(session.scalar(q) or 0.0)


def fmt_yen(n: float | int) -> str:
    return f"¥{round(n):,}"


def fmt_pct(x: float | None) -> str:
    return "—" if x is None else f"{x * 100:.2f}%"
