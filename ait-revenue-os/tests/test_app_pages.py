"""Streamlit の全画面が、サンプルデータ投入後にエラーなく表示できることを確認する。"""

from pathlib import Path

import pytest
from streamlit.testing.v1 import AppTest

from revenue_os import db
from revenue_os.seed import seed_sample

ROOT = Path(__file__).resolve().parent.parent
PAGES = {
    "today": "today.render",
    "threads": "threads.render",
    "funnel": "funnel.render",
    "dashboard": "dashboard.render",
    "departments": "departments.render",
    "research": "research.render",
    "note": "products.render_note",
    "rakuten": "products.render_rakuten",
    "contents": "contents.render_contents",
    "approvals": "contents.render_approvals",
    "import": "importer.render",
    "chad": "chad.render",
}

SCRIPT = """
import sys
sys.path.insert(0, {root!r})
from revenue_os import db
db.init_db({db!r})
from revenue_os.ui import {module}
{call}()
"""


@pytest.fixture()
def db_path(tmp_path):
    path = tmp_path / "app.db"
    db.init_db(path)
    with db.session_scope() as s:
        seed_sample(s)
    return str(path)


@pytest.mark.parametrize("page", PAGES)
def test_page_renders(db_path, page):
    target = PAGES[page]
    at = AppTest.from_string(SCRIPT.format(root=str(ROOT), db=db_path, module=target.split(".")[0], call=target), default_timeout=30)
    at.run()
    assert not at.exception, at.exception
    assert at.title  # 見出しが表示されている


def test_main_app_renders(db_path, monkeypatch):
    monkeypatch.setenv("AIT_DB_PATH", db_path)
    at = AppTest.from_file(str(ROOT / "app.py"), default_timeout=30)
    at.run()
    assert not at.exception, at.exception
    assert at.title[0].value == "✅ 今日やること"


def test_approval_queue_buttons(db_path):
    """承認キューで、チェックリスト未確認のまま承認するとエラーが出て状態が変わらない。"""
    at = AppTest.from_string(SCRIPT.format(root=str(ROOT), db=db_path, module="contents", call="contents.render_approvals"), default_timeout=30)
    at.run()
    approve_btn = next(b for b in at.button if b.label == "承認する")
    approve_btn.click().run()
    assert any("チェックリスト" in e.value for e in at.error)
    from revenue_os.models import STATUS_REVIEW, Content

    with db.session_scope() as s:
        assert s.query(Content).filter_by(status=STATUS_REVIEW).count() == 1
