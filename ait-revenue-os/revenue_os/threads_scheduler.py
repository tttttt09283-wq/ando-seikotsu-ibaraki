"""Threads の予約投稿。

安全のための決まり：
- 予約できるのは「承認済み」の Threads コンテンツだけ。予約は社長の操作でのみ作られる（承認＝予約ではない）
- 実際に投稿するのは .env の AIT_THREADS_POSTING_ENABLED=true のときだけ
- 1日の投稿上限・最短間隔を守る（公式上限250件/24時間より大幅に少ない自社上限）
- 投稿直前に品質チェックをやり直し、「要修正」があれば投稿しない
- 過去30日に同じ本文を投稿していれば投稿しない（重複・スパム防止）
- コンテナIDを保存し、再試行では同じコンテナを公開する（二重投稿防止）
- 処理中の予約はロックし、同時に2つの処理が同じ予約を投稿しない
"""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from .config import Settings, get_settings
from .models import STATUS_APPROVED, Content, ScheduledPost, ThreadsPost
from .quality import check_content, has_blocking
from .threads_api import MAX_TEXT_LENGTH, ThreadsAPI, ThreadsAPIError
from .workflow import HUMAN_ACTOR, WorkflowError, _require_human, mark_published

MAX_ATTEMPTS = 3
LOCK_TIMEOUT = timedelta(minutes=10)


def post_text(content: Content) -> str:
    return content.body.strip()


def _published_count_on(session: Session, day: date) -> int:
    start = datetime.combine(day, datetime.min.time())
    q = select(func.count(ThreadsPost.id)).where(ThreadsPost.posted_at >= start, ThreadsPost.posted_at < start + timedelta(days=1), ThreadsPost.source != "manual")
    return int(session.scalar(q) or 0)


def _last_published_at(session: Session) -> datetime | None:
    return session.scalar(select(func.max(ThreadsPost.posted_at)).where(ThreadsPost.source != "manual"))


def _duplicate_recent(session: Session, text: str, now: datetime) -> bool:
    q = select(ThreadsPost.id).where(ThreadsPost.text == text, ThreadsPost.posted_at >= now - timedelta(days=30)).limit(1)
    return session.scalar(q) is not None


def validate_for_schedule(session: Session, content: Content) -> None:
    if content.channel != "threads":
        raise WorkflowError("予約投稿できるのは Threads のコンテンツだけです。")
    if content.status != STATUS_APPROVED:
        raise WorkflowError("予約投稿できるのは「承認済み」のコンテンツだけです。")
    text = post_text(content)
    if len(text) > MAX_TEXT_LENGTH:
        raise WorkflowError(f"Threadsの投稿は{MAX_TEXT_LENGTH}文字までです（現在{len(text)}文字）。差し戻して短くしてください。")
    if has_blocking(check_content(content.channel, content.title, content.body, content.rakuten_item_id is not None)):
        raise WorkflowError("品質チェックに「要修正」の指摘があります。")


def schedule_post(session: Session, content: Content, at: datetime, actor: str, now: datetime | None = None) -> ScheduledPost:
    """社長が承認済みの Threads コンテンツを予約する。"""
    _require_human(actor)
    now = now or datetime.now()
    validate_for_schedule(session, content)
    if at < now - timedelta(minutes=1):
        raise WorkflowError("過去の日時には予約できません。")
    active = session.scalar(select(ScheduledPost.id).where(ScheduledPost.content_id == content.id, ScheduledPost.status.in_(["scheduled", "publishing"])))
    if active:
        raise WorkflowError("このコンテンツはすでに予約されています。")
    sp = ScheduledPost(content_id=content.id, scheduled_at=at, status="scheduled", scheduled_by=actor)
    session.add(sp)
    session.flush()
    return sp


def cancel_schedule(session: Session, sp: ScheduledPost, actor: str) -> None:
    _require_human(actor)
    if sp.status != "scheduled":
        raise WorkflowError("予約中のものだけ取り消せます（投稿処理中・投稿済みは取り消せません）。")
    sp.status = "cancelled"


@dataclass
class RunResult:
    schedule_id: int
    outcome: str  # published / skipped / failed / retry
    message: str


def _claim(session: Session, sp_id: int, now: datetime) -> bool:
    """予約を「処理中」にしてロックする。他の処理が先に取っていれば False。"""
    res = session.execute(
        update(ScheduledPost)
        .where(
            ScheduledPost.id == sp_id,
            (ScheduledPost.status == "scheduled") | ((ScheduledPost.status == "publishing") & (ScheduledPost.locked_at < now - LOCK_TIMEOUT)),
        )
        .values(status="publishing", locked_at=now)
    )
    session.commit()
    return res.rowcount == 1


def run_due(
    session: Session,
    api: ThreadsAPI | None,
    now: datetime | None = None,
    settings: Settings | None = None,
    sleep: Callable[[float], None] = time.sleep,
) -> list[RunResult]:
    """期限が来た予約を投稿する。1回の呼び出しで投稿するのは最大1件（間隔の上限を守るため）。"""
    settings = settings or get_settings()
    now = now or datetime.now()
    due = session.scalars(
        select(ScheduledPost)
        .where(
            ScheduledPost.scheduled_at <= now,
            (ScheduledPost.status == "scheduled") | ((ScheduledPost.status == "publishing") & (ScheduledPost.locked_at < now - LOCK_TIMEOUT)),
        )
        .order_by(ScheduledPost.scheduled_at)
    ).all()
    results: list[RunResult] = []
    if not due:
        return results
    if not settings.threads_posting_enabled:
        return [RunResult(sp.id, "skipped", "予約投稿のスイッチがオフです（.env の AIT_THREADS_POSTING_ENABLED）。") for sp in due]
    if api is None:
        return [RunResult(sp.id, "skipped", "Threads が未接続です（.env の THREADS_ACCESS_TOKEN）。") for sp in due]

    for sp in due:
        if _published_count_on(session, now.date()) >= settings.threads_daily_limit:
            results.append(RunResult(sp.id, "skipped", f"本日の投稿上限（{settings.threads_daily_limit}件）に達したため、明日以降に投稿します。"))
            continue
        last = _last_published_at(session)
        if last and now - last < timedelta(minutes=settings.threads_min_interval_min):
            wait = settings.threads_min_interval_min - int((now - last).total_seconds() // 60)
            results.append(RunResult(sp.id, "skipped", f"前の投稿から{settings.threads_min_interval_min}分たっていないため、約{wait}分後に投稿します。"))
            break
        content = session.get(Content, sp.content_id)
        try:
            if content is None:
                raise WorkflowError("元のコンテンツが削除されています。")
            validate_for_schedule(session, content)
            if not sp.container_id and _duplicate_recent(session, post_text(content), now):
                raise WorkflowError("過去30日に同じ本文を投稿しているため、投稿しません。")
        except WorkflowError as e:
            sp.status, sp.last_error = "failed", str(e)
            session.commit()
            results.append(RunResult(sp.id, "failed", str(e)))
            continue

        if not _claim(session, sp.id, now):
            continue
        session.refresh(sp)
        sp.attempts += 1
        try:
            if not sp.container_id:
                sp.container_id = api.create_text_container(post_text(content))
                session.commit()  # 再試行時に同じコンテナを使うため先に保存
                sleep(settings.threads_publish_wait_sec)
            sp.threads_id = api.publish(sp.container_id)
            session.commit()
            detail = {}
            try:
                detail = api.get_post(sp.threads_id)
            except ThreadsAPIError:
                pass
            sp.permalink = detail.get("permalink", "") or ""
            # 間隔・上限の判定がずれないよう、実際に投稿した時刻（このパソコンの時刻）で記録する
            posted_at = now
            session.add(
                ThreadsPost(
                    threads_id=sp.threads_id,
                    content_id=content.id,
                    note_product_id=content.note_product_id,
                    text=post_text(content),
                    permalink=sp.permalink,
                    posted_at=posted_at,
                    source="scheduled",
                )
            )
            mark_published(session, content, HUMAN_ACTOR, sp.permalink or f"https://www.threads.net/t/{sp.threads_id}", posted_at)
            sp.status, sp.last_error, sp.locked_at = "published", "", None
            session.commit()
            results.append(RunResult(sp.id, "published", f"投稿しました：{sp.permalink or sp.threads_id}"))
            break  # 間隔を空けるため、1回に1件まで
        except (ThreadsAPIError, WorkflowError) as e:
            sp.last_error = str(e)
            sp.locked_at = None
            sp.status = "failed" if sp.attempts >= MAX_ATTEMPTS else "scheduled"
            if sp.status == "scheduled":
                sp.scheduled_at = now + timedelta(minutes=5 * sp.attempts)
            session.commit()
            results.append(RunResult(sp.id, "failed" if sp.status == "failed" else "retry", str(e)))
    return results


def make_api(settings: Settings | None = None) -> ThreadsAPI | None:
    settings = settings or get_settings()
    if not settings.threads_access_token:
        return None
    return ThreadsAPI(settings.threads_access_token, settings.threads_api_base)
