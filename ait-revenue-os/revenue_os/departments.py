"""部門（AI社員）ごとの稼働状況。すべてDBの記録から集計する（架空の稼働は表示しない）。

部門の「稼働中」は、直近24時間に記録（AI生成・タスク更新など）がある状態を指す。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import (
    STATUS_APPROVED,
    STATUS_REVIEW,
    AIUsage,
    ApprovalEvent,
    Content,
    ContentRevision,
    DailyReport,
    ImportBatch,
    NoteProduct,
    RakutenItem,
    ResearchTheme,
    SalesRecord,
    Task,
)


@dataclass(frozen=True)
class Department:
    key: str
    name: str
    role: str  # AI社員の役割名（Task.role / AIUsage.role と一致）
    icon: str
    mission: str


DEPARTMENTS = [
    Department("chad", "統括（チャド）", "チャド", "🧭", "全体の優先順位と日次報告"),
    Department("research", "市場調査部", "市場調査AI", "🔎", "需要の仮説と出典の整理"),
    Department("product", "商品開発部", "商品開発AI", "📘", "note商品の設計・楽天商品の評価"),
    Department("marketing", "マーケティング部", "マーケティングAI", "📣", "Threads・X・noteの下書き"),
    Department("sales", "営業部", "営業AI", "🤝", "販売導線とCTA"),
    Department("finance", "経理部", "経理分析AI", "💴", "売上取り込み・KPI分析"),
    Department("quality", "品質管理部", "品質管理AI", "🛡️", "事実確認・広告表示・規約チェック"),
    Department("ceo", "社長", "社長", "👤", "承認・公開・最終判断"),
]
DEPT_BY_ROLE = {d.role: d for d in DEPARTMENTS}


@dataclass
class Metric:
    label: str
    value: str
    alert: bool = False  # 社長の対応が必要／滞っている


@dataclass
class DepartmentStatus:
    dept: Department
    active: bool
    last_activity: datetime | None
    open_tasks: int
    done_tasks_7d: int
    ai_runs_7d: int
    ai_cost_month_yen: float
    metrics: list[Metric] = field(default_factory=list)

    @property
    def needs_attention(self) -> bool:
        return any(m.alert for m in self.metrics)


@dataclass(frozen=True)
class ActivityItem:
    at: datetime
    department: str
    icon: str
    text: str


def _count(session: Session, q) -> int:
    return int(session.scalar(q) or 0)


def _dept_metrics(session: Session, key: str, now: datetime) -> list[Metric]:
    week_ago = now - timedelta(days=7)
    stale = now - timedelta(days=7)
    if key == "chad":
        last = session.scalar(select(func.max(DailyReport.report_date)))
        missing = last is None or last < now.date() - timedelta(days=1)
        return [Metric("最新の日次報告", last.strftime("%m/%d") if last else "未作成", missing)]
    if key == "research":
        unverified = _count(session, select(func.count(ResearchTheme.id)).where(ResearchTheme.verification_status.in_(["未検証", "検証中"])))
        verified = _count(session, select(func.count(ResearchTheme.id)).where(ResearchTheme.verification_status == "確認済み"))
        return [Metric("確認済みテーマ", f"{verified}件"), Metric("未検証テーマ", f"{unverified}件", unverified > 0)]
    if key == "product":
        planning = _count(session, select(func.count(NoteProduct.id)).where(NoteProduct.status.in_(["企画中", "制作中"])))
        selling = _count(session, select(func.count(NoteProduct.id)).where(NoteProduct.status == "販売中"))
        stale_items = _count(
            session,
            select(func.count(RakutenItem.id)).where(
                RakutenItem.status != "見送り", (RakutenItem.price_checked_at.is_(None)) | (RakutenItem.price_checked_at < stale)
            ),
        )
        return [Metric("販売中のnote商品", f"{selling}件"), Metric("企画・制作中", f"{planning}件"), Metric("価格の再確認が必要な楽天商品", f"{stale_items}件", stale_items > 0)]
    if key == "marketing":
        drafts = _count(session, select(func.count(Content.id)).where(Content.status == "draft"))
        made = _count(session, select(func.count(Content.id)).where(Content.created_at >= week_ago))
        published = _count(session, select(func.count(Content.id)).where(Content.status == "published", Content.published_at >= week_ago))
        return [Metric("今週の作成", f"{made}件"), Metric("下書き", f"{drafts}件"), Metric("今週の公開", f"{published}件")]
    if key == "sales":
        no_cta = _count(session, select(func.count(NoteProduct.id)).where(NoteProduct.status != "停止", NoteProduct.cta == ""))
        no_url = _count(session, select(func.count(NoteProduct.id)).where(NoteProduct.status == "販売中", NoteProduct.public_url == ""))
        return [Metric("CTA未設定の商品", f"{no_cta}件", no_cta > 0), Metric("公開URL未記録の販売中商品", f"{no_url}件", no_url > 0)]
    if key == "finance":
        last_import = session.scalar(select(func.max(ImportBatch.created_at)))
        month_start = now.date().replace(day=1)
        rev = int(session.scalar(select(func.coalesce(func.sum(SalesRecord.revenue_yen), 0)).where(SalesRecord.order_date >= month_start)) or 0)
        old = last_import is None or last_import < now - timedelta(days=7)
        return [Metric("今月の受取額", f"¥{rev:,}"), Metric("最終CSV取り込み", last_import.strftime("%m/%d") if last_import else "未実施", old)]
    if key == "quality":
        waiting = _count(session, select(func.count(Content.id)).where(Content.status == STATUS_REVIEW))
        rejected = _count(session, select(func.count(ApprovalEvent.id)).where(ApprovalEvent.to_status == "rejected", ApprovalEvent.created_at >= week_ago))
        return [Metric("レビュー待ち", f"{waiting}件", waiting > 0), Metric("今週の却下", f"{rejected}件")]
    if key == "ceo":
        waiting = _count(session, select(func.count(Content.id)).where(Content.status == STATUS_REVIEW))
        unpublished = _count(session, select(func.count(Content.id)).where(Content.status == STATUS_APPROVED))
        return [Metric("承認待ち", f"{waiting}件", waiting > 0), Metric("承認済み・未公開", f"{unpublished}件", unpublished > 0)]
    return []


def department_statuses(session: Session, now: datetime | None = None) -> list[DepartmentStatus]:
    now = now or datetime.now()
    week_ago = now - timedelta(days=7)
    month_start = datetime.combine(now.date().replace(day=1), datetime.min.time())
    result = []
    for d in DEPARTMENTS:
        last_ai = session.scalar(select(func.max(AIUsage.created_at)).where(AIUsage.role == d.role))
        last_task = session.scalar(select(func.max(Task.updated_at)).where(Task.role == d.role))
        last_edit = session.scalar(select(func.max(ContentRevision.created_at)).where(ContentRevision.editor == d.role))
        last_event = session.scalar(select(func.max(ApprovalEvent.created_at)).where(ApprovalEvent.actor == d.role))
        last_import = session.scalar(select(func.max(ImportBatch.created_at))) if d.key == "finance" else None
        last = max([x for x in (last_ai, last_task, last_edit, last_event, last_import) if x is not None], default=None)
        result.append(
            DepartmentStatus(
                dept=d,
                active=last is not None and last >= now - timedelta(hours=24),
                last_activity=last,
                open_tasks=_count(session, select(func.count(Task.id)).where(Task.role == d.role, Task.status != "完了")),
                done_tasks_7d=_count(session, select(func.count(Task.id)).where(Task.role == d.role, Task.status == "完了", Task.updated_at >= week_ago)),
                ai_runs_7d=_count(session, select(func.count(AIUsage.id)).where(AIUsage.role == d.role, AIUsage.created_at >= week_ago)),
                ai_cost_month_yen=float(session.scalar(select(func.coalesce(func.sum(AIUsage.cost_yen), 0.0)).where(AIUsage.role == d.role, AIUsage.created_at >= month_start)) or 0.0),
                metrics=_dept_metrics(session, d.key, now),
            )
        )
    return result


def recent_activity(session: Session, limit: int = 40, department_role: str | None = None) -> list[ActivityItem]:
    """AI生成・コンテンツ編集・承認・CSV取り込み・日次報告を時系列でまとめる。"""
    items: list[ActivityItem] = []

    def add(at, role, text):
        d = DEPT_BY_ROLE.get(role)
        if at is None or (department_role and role != department_role):
            return
        items.append(ActivityItem(at, d.name if d else role, d.icon if d else "•", text))

    for u in session.scalars(select(AIUsage).order_by(AIUsage.id.desc()).limit(limit)):
        how = "AI" if u.mode == "api" else "テンプレート"
        add(u.created_at, u.role, f"{u.purpose}（{how}{'・エラー' if u.error else ''}）")
    for r in session.scalars(select(ContentRevision).order_by(ContentRevision.id.desc()).limit(limit)):
        add(r.created_at, r.editor, f"コンテンツ#{r.content_id}を{r.note or '編集'}")
    labels = {"review": "レビューに出した", "approved": "承認した", "rejected": "却下した", "draft": "下書きに戻した", "published": "公開済みとして記録した"}
    for e in session.scalars(select(ApprovalEvent).order_by(ApprovalEvent.id.desc()).limit(limit)):
        add(e.created_at, e.actor, f"コンテンツ#{e.content_id}を{labels.get(e.to_status, e.to_status)}")
    for b in session.scalars(select(ImportBatch).order_by(ImportBatch.id.desc()).limit(limit)):
        add(b.created_at, "経理分析AI", f"{'note' if b.source == 'note' else '楽天'}の売上CSVを取り込み（新規{b.rows_imported}件・重複{b.rows_duplicated}件）")
    for rep in session.scalars(select(DailyReport).order_by(DailyReport.id.desc()).limit(limit)):
        add(rep.created_at, "チャド", f"{rep.report_date:%m/%d} の日次報告を作成")
    for t in session.scalars(select(Task).where(Task.status == "完了").order_by(Task.updated_at.desc()).limit(limit)):
        add(t.updated_at, t.role, f"タスク完了：{t.title}")
    items.sort(key=lambda x: x.at, reverse=True)
    return items[:limit]


def tasks_by_department(session: Session, role: str | None = None) -> dict[str, list[Task]]:
    q = select(Task).order_by(Task.priority, Task.due_date.is_(None), Task.due_date, Task.id)
    if role:
        q = q.where(Task.role == role)
    board: dict[str, list[Task]] = {"未着手": [], "進行中": [], "完了": []}
    for t in session.scalars(q):
        board.setdefault(t.status, []).append(t)
    return board


def overdue(task: Task, today: date | None = None) -> bool:
    today = today or date.today()
    return task.status != "完了" and task.due_date is not None and task.due_date < today
