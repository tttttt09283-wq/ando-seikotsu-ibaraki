"""「今日やること」：全部門の状態から、今日対応すべきことを優先度順に並べる。

すべてDBの実データから判定する。対応が済めば自動で一覧から消える。
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .config import get_settings
from .models import (
    STATUS_APPROVED,
    STATUS_DRAFT,
    STATUS_REVIEW,
    Content,
    DailyReport,
    ImportBatch,
    NoteProduct,
    RakutenItem,
    ResearchTheme,
    ScheduledPost,
    Task,
    ThreadsInsight,
    ThreadsPost,
)
from .threads_analytics import daily_post_target, funnel_rows, get_setting


@dataclass(frozen=True)
class TodayItem:
    priority: int  # 1=今すぐ 2=今日中 3=余裕があれば
    role: str  # 担当（社長 or 部門のAI役割名）
    title: str
    detail: str
    page: str  # 画面のキー（ui/nav.py）
    count: int = 1


@dataclass
class TodayPlan:
    items: list[TodayItem]
    scheduled_today: list[tuple[datetime, str, str]]  # 時刻, 状態, 本文冒頭
    posts_today: int
    post_target: int


def _n(session: Session, q) -> int:
    return int(session.scalar(q) or 0)


def build_today(session: Session, now: datetime | None = None) -> TodayPlan:
    now = now or datetime.now()
    today = now.date()
    start = datetime.combine(today, datetime.min.time())
    end = start + timedelta(days=1)
    s = get_settings()
    items: list[TodayItem] = []
    add = items.append

    # ---- 社長の判断（最優先） ----
    n = _n(session, select(func.count(Content.id)).where(Content.status == STATUS_REVIEW))
    if n:
        add(TodayItem(1, "社長", f"承認待ち {n}件を確認する", "チェックリストを確認して承認・差し戻し", "approvals", n))
    failed = _n(session, select(func.count(ScheduledPost.id)).where(ScheduledPost.status == "failed", ScheduledPost.updated_at >= now - timedelta(days=3)))
    if failed:
        add(TodayItem(1, "社長", f"失敗した予約投稿 {failed}件を確認する", "理由を確認し、修正して予約し直す", "threads", failed))
    n = _n(
        session,
        select(func.count(Content.id)).where(
            Content.status == STATUS_APPROVED,
            Content.channel == "threads",
            ~select(ScheduledPost.id).where(ScheduledPost.content_id == Content.id, ScheduledPost.status.in_(["scheduled", "publishing"])).exists(),
        ),
    )
    if n:
        add(TodayItem(1, "社長", f"承認済みの Threads 投稿 {n}件の投稿日時を予約する", "おすすめの時間帯を見て予約", "threads", n))
    n = _n(session, select(func.count(Content.id)).where(Content.status == STATUS_APPROVED, Content.channel != "threads"))
    if n:
        add(TodayItem(2, "社長", f"承認済み（X・note）{n}件を各サービスで公開し、URLを記録する", "公開は手作業。公開後に承認キューでURLを入力", "approvals", n))

    # ---- Threads（認知拡大） ----
    target = daily_post_target(session)
    posts_today = _n(session, select(func.count(ThreadsPost.id)).where(ThreadsPost.posted_at >= start, ThreadsPost.posted_at < end))
    scheduled_rows = session.execute(
        select(ScheduledPost.scheduled_at, ScheduledPost.status, Content.body)
        .join(Content, Content.id == ScheduledPost.content_id)
        .where(ScheduledPost.scheduled_at >= start, ScheduledPost.scheduled_at < end, ScheduledPost.status != "cancelled")
        .order_by(ScheduledPost.scheduled_at)
    ).all()
    planned = posts_today + sum(1 for _, st, _ in scheduled_rows if st in ("scheduled", "publishing"))
    if planned < target:
        lack = target - planned
        drafts = _n(session, select(func.count(Content.id)).where(Content.channel == "threads", Content.status == STATUS_DRAFT))
        if drafts:
            add(TodayItem(2, "社長", f"Threads の下書き {drafts}件をレビューに出す（今日の投稿があと{lack}本足りません）", "コンテンツ管理で確認してレビューへ", "contents", lack))
        add(TodayItem(2, "マーケティングAI", f"伸びた型で Threads 投稿案を{lack}本つくる", f"今日の目標 {target}本／投稿済み・予約 {planned}本", "threads", lack))
    if s.threads_connected:
        last_sync = get_setting(session, "threads_last_sync")
        if not last_sync or datetime.fromisoformat(last_sync) < now - timedelta(hours=12):
            add(TodayItem(2, "マーケティングAI", "Threads の投稿と反応数を最新にする（同期）", "最終同期：" + (last_sync[:16].replace("T", " ") if last_sync else "未実施"), "threads"))
        issued = s.threads_token_issued_at
        if issued:
            try:
                age = now - datetime.fromisoformat(issued)
                if age > timedelta(days=50):
                    add(TodayItem(1, "社長", "Threads のトークンを更新する（期限60日が近い）", f"発行から{age.days}日", "threads"))
            except ValueError:
                pass
    else:
        no_metrics = _n(
            session,
            select(func.count(ThreadsPost.id)).where(ThreadsPost.posted_at >= now - timedelta(days=7), ~select(ThreadsInsight.id).where(ThreadsInsight.post_id == ThreadsPost.id).exists()),
        )
        if no_metrics:
            add(TodayItem(3, "マーケティングAI", f"反応数が未入力の投稿 {no_metrics}件に数字を入れる", "Threadsアプリのインサイトから転記", "threads", no_metrics))

    # ---- note 導線 ----
    for f in funnel_rows(session, now):
        if f.status == "停止":
            continue
        missing = [label for _, label, ok, _ in f.checks if not ok]
        if missing:
            add(TodayItem(2 if f.status == "販売中" else 3, "営業AI", f"「{f.title}」の導線を整える（{f.score}点）", "未対応：" + "／".join(missing[:2]) + ("…" if len(missing) > 2 else ""), "funnel", len(missing)))

    # ---- 経理・調査・商品 ----
    last_import = session.scalar(select(func.max(ImportBatch.created_at)))
    if last_import is None or last_import < now - timedelta(days=7):
        add(TodayItem(2, "経理分析AI", "note・楽天の売上CSVを取り込む", "最終取り込み：" + (last_import.strftime("%m/%d") if last_import else "未実施"), "import"))
    n = _n(session, select(func.count(RakutenItem.id)).where(RakutenItem.status != "見送り", or_(RakutenItem.price_checked_at.is_(None), RakutenItem.price_checked_at < now - timedelta(days=7))))
    if n:
        add(TodayItem(3, "商品開発AI", f"楽天商品 {n}件の価格・在庫を再確認する", "確認から7日以上たっています", "rakuten", n))
    n = _n(session, select(func.count(ResearchTheme.id)).where(ResearchTheme.verification_status.in_(["未検証", "検証中"])))
    if n:
        add(TodayItem(3, "市場調査AI", f"未検証の調査テーマ {n}件の出典を確認する", "確認できた事実だけを「確認済み」に", "research", n))
    n = _n(session, select(func.count(NoteProduct.id)).where(NoteProduct.status.in_(["企画中", "制作中"])))
    if n:
        add(TodayItem(3, "商品開発AI", f"制作中の note 商品 {n}件を進める", "原稿・価格・CTAを仕上げて販売へ", "note", n))

    # ---- タスク・報告 ----
    for t in session.scalars(select(Task).where(Task.status != "完了", Task.due_date.is_not(None), Task.due_date <= today).order_by(Task.priority)):
        late = t.due_date < today
        add(TodayItem(1 if late else min(t.priority, 2), t.role, f"{'【期限切れ】' if late else '【今日まで】'}{t.title}", f"期限 {t.due_date:%m/%d}", "departments"))
    if not session.scalar(select(DailyReport.id).where(DailyReport.report_date == today).limit(1)):
        add(TodayItem(3, "チャド", "今日の日次報告をつくる（1日の締め）", "実績・改善提案・明日の優先タスク", "chad"))

    items.sort(key=lambda x: (x.priority, 0 if x.role == "社長" else 1))
    scheduled_today = [(at, st, (body or "").strip().splitlines()[0][:40] if body else "") for at, st, body in scheduled_rows]
    return TodayPlan(items, scheduled_today, posts_today, target)


def ceo_minutes(items: list[TodayItem]) -> int:
    """社長の作業時間の目安（分）。承認1件3分、予約1件1分、その他5分。"""
    total = 0
    for it in items:
        if it.role != "社長":
            continue
        total += {"approvals": 3, "threads": 1}.get(it.page, 5) * max(1, it.count)
    return total


def today_date() -> date:
    return date.today()
