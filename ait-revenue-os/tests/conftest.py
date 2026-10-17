import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# テストでは実際のAPIを呼ばない（.env にキーがあっても無効化）
os.environ["ANTHROPIC_API_KEY"] = ""
for _k in ("THREADS_ACCESS_TOKEN", "INSTAGRAM_ACCESS_TOKEN"):
    os.environ[_k] = ""

from revenue_os import db  # noqa: E402


@pytest.fixture(autouse=True)
def _isolated_secrets(tmp_path, monkeypatch):
    from revenue_os.connectors import secrets_store

    monkeypatch.setattr(secrets_store, "SECRETS_DIR", tmp_path / "secrets")


@pytest.fixture()
def session(tmp_path):
    db.init_db(tmp_path / "test.db")
    with db.session_scope() as s:
        yield s
