import pytest

from revenue_os.models import STATUS_APPROVED, STATUS_DRAFT, STATUS_PUBLISHED, STATUS_REJECTED, STATUS_REVIEW, ApprovalEvent, RakutenItem
from revenue_os.quality import checklist_for
from revenue_os.workflow import (
    HUMAN_ACTOR,
    WorkflowError,
    approve,
    create_content,
    edit_content,
    mark_published,
    reject,
    reopen,
    send_back,
    submit_for_review,
)


def _all_checked(c):
    return {k: True for k, _ in checklist_for(c.channel, c.body, c.rakuten_item_id is not None, c.note_product_id is not None)}


def test_full_flow_and_approval_does_not_publish(session):
    c = create_content(session, "threads", "", "手順をまとめました（リンク）")
    submit_for_review(session, c, HUMAN_ACTOR)
    assert c.status == STATUS_REVIEW
    approve(session, c, HUMAN_ACTOR, _all_checked(c))
    assert c.status == STATUS_APPROVED
    assert c.public_url == "" and c.published_at is None  # 承認は公開ではない
    mark_published(session, c, HUMAN_ACTOR, "https://www.threads.net/@ait/post/1")
    assert c.status == STATUS_PUBLISHED and c.public_url.startswith("https://") and c.published_at
    session.flush()
    assert [e.to_status for e in session.query(ApprovalEvent).filter_by(content_id=c.id).order_by(ApprovalEvent.id)] == [STATUS_REVIEW, STATUS_APPROVED, STATUS_PUBLISHED]


def test_ai_roles_cannot_approve_or_publish(session):
    c = create_content(session, "x", "", "本文", actor="マーケティングAI", ai_generated=True)
    submit_for_review(session, c, "マーケティングAI")
    for actor in ["チャド", "品質管理AI", "誰か"]:
        with pytest.raises(WorkflowError):
            approve(session, c, actor, _all_checked(c))
    approve(session, c, HUMAN_ACTOR, _all_checked(c))
    with pytest.raises(WorkflowError):
        mark_published(session, c, "チャド", "https://x.com/a/status/1")


def test_checklist_required(session):
    c = create_content(session, "x", "", "本文")
    submit_for_review(session, c, HUMAN_ACTOR)
    with pytest.raises(WorkflowError, match="チェックリスト"):
        approve(session, c, HUMAN_ACTOR, {})
    assert c.status == STATUS_REVIEW


def test_affiliate_without_pr_label_cannot_be_approved(session):
    item = RakutenItem(name="商品")
    session.add(item)
    session.flush()
    c = create_content(session, "x", "", "おすすめです（リンク）", rakuten_item_id=item.id)
    submit_for_review(session, c, HUMAN_ACTOR)
    with pytest.raises(WorkflowError, match="要修正"):
        approve(session, c, HUMAN_ACTOR, _all_checked(c))
    # アフィリエイト用のチェック項目が含まれる
    assert "pr_label" in _all_checked(c)


def test_publish_requires_valid_url_and_approved_state(session):
    c = create_content(session, "note", "タイトル", "本文")
    with pytest.raises(WorkflowError):
        mark_published(session, c, HUMAN_ACTOR, "https://note.com/a/n/1")  # 下書きからは不可
    submit_for_review(session, c, HUMAN_ACTOR)
    approve(session, c, HUMAN_ACTOR, _all_checked(c))
    for bad in ["", "note.com/a", "javascript:alert(1)", "ftp://x"]:
        with pytest.raises(WorkflowError):
            mark_published(session, c, HUMAN_ACTOR, bad)
    assert c.status == STATUS_APPROVED


def test_reject_send_back_reopen_and_edit_rules(session):
    c = create_content(session, "threads", "", "v1")
    edit_content(session, c, "", "v2", HUMAN_ACTOR)
    submit_for_review(session, c, HUMAN_ACTOR)
    with pytest.raises(WorkflowError):
        edit_content(session, c, "", "v3", HUMAN_ACTOR)  # レビュー中は編集不可
    with pytest.raises(WorkflowError):
        reject(session, c, HUMAN_ACTOR, "")  # 理由必須
    reject(session, c, HUMAN_ACTOR, "表現が強い")
    assert c.status == STATUS_REJECTED
    reopen(session, c, HUMAN_ACTOR)
    assert c.status == STATUS_DRAFT
    edit_content(session, c, "", "v3", HUMAN_ACTOR)
    submit_for_review(session, c, HUMAN_ACTOR)
    send_back(session, c, HUMAN_ACTOR, "もう少し短く")
    assert c.status == STATUS_DRAFT
    session.flush()
    assert [r.body for r in c.revisions] == ["v1", "v2", "v3"]


def test_cannot_skip_review(session):
    c = create_content(session, "x", "", "本文")
    with pytest.raises(WorkflowError):
        approve(session, c, HUMAN_ACTOR, _all_checked(c))
