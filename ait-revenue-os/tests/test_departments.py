from datetime import date, datetime, timedelta

from revenue_os.ai.generators import research_hypotheses
from revenue_os.departments import DEPARTMENTS, department_statuses, overdue, recent_activity, tasks_by_department
from revenue_os.models import Task
from revenue_os.seed import seed_sample
from revenue_os.workflow import HUMAN_ACTOR, create_content, submit_for_review


def _by_key(statuses):
    return {x.dept.key: x for x in statuses}


def test_all_departments_idle_on_empty_db(session):
    st = department_statuses(session)
    assert len(st) == len(DEPARTMENTS)
    assert not any(x.active for x in st)  # 記録がなければ稼働中にしない


def test_activity_makes_department_active(session):
    research_hypotheses(session, "テーマ", "", "")
    session.add(Task(title="t", role="営業AI"))
    session.flush()
    st = _by_key(department_statuses(session))
    assert st["research"].active and st["research"].ai_runs_7d == 1
    assert st["sales"].active and st["sales"].open_tasks == 1
    assert not st["finance"].active
    # 25時間後には待機に戻る
    later = datetime.now() + timedelta(hours=25)
    assert not _by_key(department_statuses(session, later))["research"].active


def test_attention_flags(session):
    c = create_content(session, "x", "", "本文")
    submit_for_review(session, c, HUMAN_ACTOR)
    session.flush()
    st = _by_key(department_statuses(session))
    assert st["ceo"].needs_attention and st["quality"].needs_attention
    assert st["chad"].needs_attention  # 日次報告が未作成


def test_seeded_activity_and_board(session):
    seed_sample(session)
    items = recent_activity(session, 50)
    assert items and items == sorted(items, key=lambda x: x.at, reverse=True)
    assert any(i.department == "経理部" for i in items)
    st = _by_key(department_statuses(session))
    assert st["marketing"].active and st["finance"].active  # 下書き作成・CSV取り込みも稼働として数える
    assert all(i.department == "マーケティング部" for i in recent_activity(session, 50, "マーケティングAI"))
    board = tasks_by_department(session)
    assert set(board) >= {"未着手", "進行中", "完了"} and board["未着手"]


def test_overdue():
    t = Task(title="t", role="チャド", status="未着手", due_date=date.today() - timedelta(days=1))
    assert overdue(t)
    t.status = "完了"
    assert not overdue(t)
