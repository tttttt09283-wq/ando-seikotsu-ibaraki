"""チャド日次報告。

- 「実績」は DB から集計した確認済みの数字だけで作る（AIは数字を作らない）
- 「改善提案」は AI またはテンプレートの仮説として、実績と分けて保存する
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .ai.generators import chad_daily
from .kpi import compute_kpi, fmt_pct, fmt_yen
from .models import (
    STATUS_APPROVED,
    STATUS_PUBLISHED,
    STATUS_REVIEW,
    Content,
    DailyReport,
    RakutenItem,
    ResearchTheme,
    SalesRecord,
    Task,
)

PRIORITY_LABEL = {1: "高", 2: "中", 3: "低"}


def collect_facts(session: Session, day: date, include_sample: bool = True) -> dict:
    today = compute_kpi(session, day, day, include_sample)
    month = compute_kpi(session, day.replace(day=1), day, include_sample)
    last30 = compute_kpi(session, day - timedelta(days=29), day, include_sample)
    count = lambda q: int(session.scalar(q) or 0)  # noqa: E731
    stale_before = datetime.combine(day - timedelta(days=7), datetime.min.time())
    return {
        "date": day.isoformat(),
        "today_revenue_yen": today.revenue_yen,
        "today_orders": today.orders,
        "month_revenue_yen": month.revenue_yen,
        "month_note_revenue_yen": month.note.revenue_yen,
        "month_rakuten_revenue_yen": month.rakuten.revenue_yen,
        "month_cost_yen": round(month.cost_yen, 2),
        "month_gross_profit_yen": round(month.gross_profit_yen, 2),
        "month_ctr": month.ctr,
        "month_cvr": month.cvr,
        "orders_30d": last30.orders,
        "review_waiting": count(select(func.count(Content.id)).where(Content.status == STATUS_REVIEW)),
        "approved_unpublished": count(select(func.count(Content.id)).where(Content.status == STATUS_APPROVED)),
        "published_today": count(
            select(func.count(Content.id)).where(Content.status == STATUS_PUBLISHED, func.date(Content.published_at) == day.isoformat())
        ),
        "unverified_themes": count(select(func.count(ResearchTheme.id)).where(ResearchTheme.verification_status.in_(["未検証", "検証中"]))),
        "stale_rakuten": count(
            select(func.count(RakutenItem.id)).where(
                RakutenItem.status != "見送り",
                or_(RakutenItem.price_checked_at.is_(None), RakutenItem.price_checked_at < stale_before),
            )
        ),
        "open_tasks": count(select(func.count(Task.id)).where(Task.status != "完了")),
        "includes_sample": include_sample and session.scalar(select(SalesRecord.id).where(SalesRecord.is_sample.is_(True)).limit(1)) is not None,
    }


def facts_markdown(f: dict) -> str:
    return "\n".join(
        [
            *(["- 🧪 **サンプルデータを含む集計です（実績ではありません）**"] if f.get("includes_sample") else []),
            f"- 本日の売上（受取額）：**{fmt_yen(f['today_revenue_yen'])}**（{f['today_orders']}件）",
            f"- 今月の売上（受取額）：**{fmt_yen(f['month_revenue_yen'])}**（note {fmt_yen(f['month_note_revenue_yen'])} ／ 楽天 {fmt_yen(f['month_rakuten_revenue_yen'])}）",
            f"- 今月の費用：{fmt_yen(f['month_cost_yen'])} ／ 粗利益：**{fmt_yen(f['month_gross_profit_yen'])}**",
            f"- 今月の CTR：{fmt_pct(f['month_ctr'])} ／ CVR：{fmt_pct(f['month_cvr'])}",
            f"- レビュー待ち：{f['review_waiting']}件 ／ 承認済み・未公開：{f['approved_unpublished']}件 ／ 本日公開：{f['published_today']}件",
            f"- 未検証の調査テーマ：{f['unverified_themes']}件 ／ 価格確認が7日以上前の楽天商品：{f['stale_rakuten']}件",
            f"- 未完了タスク：{f['open_tasks']}件",
        ]
    )


def generate_daily_report(session: Session, day: date | None = None, include_sample: bool = True, create_tasks: bool = True, **kw) -> tuple[DailyReport, str]:
    day = day or date.today()
    facts = collect_facts(session, day, include_sample)
    result = chad_daily(session, facts, **kw)
    suggestions = result.data.get("suggestions", [])
    priorities = sorted(result.data.get("priorities", []), key=lambda p: p.get("priority", 2))[:3]
    report = DailyReport(
        report_date=day,
        facts_md=facts_markdown(facts),
        suggestions_md="\n".join(f"- {s}" for s in suggestions) or "- （提案なし）",
        priorities_md="\n".join(f"{i}. [{PRIORITY_LABEL.get(p.get('priority', 2), '中')}] {p['title']}（担当：{p['role']}）" for i, p in enumerate(priorities, 1)) or "（なし）",
        generated_by=result.mode,
    )
    session.add(report)
    if create_tasks:
        existing = set(session.scalars(select(Task.title).where(Task.status != "完了")))
        for p in priorities:
            if p["title"] not in existing:
                session.add(Task(title=p["title"], role=p["role"], priority=p.get("priority", 2), due_date=day + timedelta(days=1), note=f"{day} のチャド日次報告より"))
    session.flush()
    return report, result.notice
