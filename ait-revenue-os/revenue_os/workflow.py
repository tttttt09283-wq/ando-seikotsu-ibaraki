"""承認ワークフロー。

  下書き → レビュー待ち → 承認済み → 公開済み
                      ↘ 却下 → 下書き（作り直し）
                      ↘ 下書き（差し戻し）

重要なルール:
- 承認・公開記録は人間（社長）だけが行える。AI役割は承認できない。
- 「承認」は状態を変えるだけで、外部サービスへの投稿・公開は一切行わない。
- 「公開済み」は、人間が外部サービスで公開した後、そのURLを入力して記録する。
- 本文を編集できるのは下書きの間だけ。編集のたびに修正履歴を残す。
"""

from __future__ import annotations

import json
from datetime import datetime
from urllib.parse import urlparse

from sqlalchemy.orm import Session

from .models import (
    STATUS_APPROVED,
    STATUS_DRAFT,
    STATUS_PUBLISHED,
    STATUS_REJECTED,
    STATUS_REVIEW,
    ApprovalEvent,
    Content,
    ContentRevision,
)
from .quality import check_content, checklist_for, has_blocking

HUMAN_ACTOR = "社長"
AI_ROLES = {"チャド", "市場調査AI", "商品開発AI", "マーケティングAI", "営業AI", "経理分析AI", "品質管理AI"}

ALLOWED = {
    (STATUS_DRAFT, STATUS_REVIEW),
    (STATUS_REVIEW, STATUS_APPROVED),
    (STATUS_REVIEW, STATUS_REJECTED),
    (STATUS_REVIEW, STATUS_DRAFT),
    (STATUS_REJECTED, STATUS_DRAFT),
    (STATUS_APPROVED, STATUS_PUBLISHED),
    (STATUS_APPROVED, STATUS_DRAFT),
}


class WorkflowError(Exception):
    """利用者に表示できる日本語のエラー。"""


def _require_human(actor: str) -> None:
    if actor in AI_ROLES or actor != HUMAN_ACTOR:
        raise WorkflowError("この操作は人間（社長）だけが行えます。")


def _transition(session: Session, content: Content, to: str, actor: str, comment: str = "", checklist: dict | None = None) -> None:
    if (content.status, to) not in ALLOWED:
        raise WorkflowError(f"現在の状態から、この操作はできません（{content.status} → {to}）。")
    session.add(
        ApprovalEvent(
            content_id=content.id,
            from_status=content.status,
            to_status=to,
            actor=actor,
            comment=comment,
            checklist_json=json.dumps(checklist or {}, ensure_ascii=False),
        )
    )
    content.status = to


def create_content(
    session: Session,
    channel: str,
    title: str,
    body: str,
    actor: str = HUMAN_ACTOR,
    ai_generated: bool = False,
    note_product_id: int | None = None,
    rakuten_item_id: int | None = None,
    is_sample: bool = False,
) -> Content:
    content = Content(
        channel=channel,
        title=title,
        body=body,
        status=STATUS_DRAFT,
        ai_generated=ai_generated,
        note_product_id=note_product_id,
        rakuten_item_id=rakuten_item_id,
        is_sample=is_sample,
    )
    session.add(content)
    session.flush()
    session.add(ContentRevision(content_id=content.id, title=title, body=body, editor=actor, note="作成"))
    return content


def edit_content(session: Session, content: Content, title: str, body: str, actor: str, note: str = "") -> None:
    if content.status != STATUS_DRAFT:
        raise WorkflowError("編集できるのは「下書き」の間だけです。承認済み・レビュー中の内容は、差し戻してから編集してください。")
    if title == content.title and body == content.body:
        return
    content.title = title
    content.body = body
    session.add(ContentRevision(content_id=content.id, title=title, body=body, editor=actor, note=note or "編集"))


def submit_for_review(session: Session, content: Content, actor: str) -> None:
    if not content.body.strip():
        raise WorkflowError("本文が空のため、レビューに出せません。")
    _transition(session, content, STATUS_REVIEW, actor, "レビュー依頼")


def approve(session: Session, content: Content, actor: str, checked: dict[str, bool], comment: str = "") -> None:
    """承認する。公開処理は行わない。"""
    _require_human(actor)
    findings = check_content(content.channel, content.title, content.body, content.rakuten_item_id is not None)
    if has_blocking(findings):
        raise WorkflowError("品質チェックに「要修正」の指摘があります。差し戻して修正してください。")
    required = checklist_for(content.channel, content.body, content.rakuten_item_id is not None, content.note_product_id is not None)
    missing = [label for key, label in required if not checked.get(key)]
    if missing:
        raise WorkflowError("チェックリストに未確認の項目があります：\n・" + "\n・".join(missing))
    _transition(session, content, STATUS_APPROVED, actor, comment or "承認", {k: bool(checked.get(k)) for k, _ in required})


def reject(session: Session, content: Content, actor: str, comment: str) -> None:
    _require_human(actor)
    if not comment.strip():
        raise WorkflowError("却下の理由を入力してください。")
    _transition(session, content, STATUS_REJECTED, actor, comment)


def send_back(session: Session, content: Content, actor: str, comment: str) -> None:
    """レビュー待ち・承認済みを下書きに戻す（修正のため）。"""
    _require_human(actor)
    if not comment.strip():
        raise WorkflowError("差し戻しの理由を入力してください。")
    _transition(session, content, STATUS_DRAFT, actor, comment)


def reopen(session: Session, content: Content, actor: str) -> None:
    _transition(session, content, STATUS_DRAFT, actor, "作り直し")


def validate_public_url(url: str) -> str:
    url = (url or "").strip()
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise WorkflowError("公開URLは https:// から始まる正しいURLを入力してください。")
    return url


def mark_published(session: Session, content: Content, actor: str, public_url: str, published_at: datetime | None = None) -> None:
    """人間が外部サービスで公開した後に、そのURLで「公開済み」と記録する。外部への通信は行わない。"""
    _require_human(actor)
    url = validate_public_url(public_url)
    _transition(session, content, STATUS_PUBLISHED, actor, f"公開URL：{url}")
    content.public_url = url
    content.published_at = published_at or datetime.now()
