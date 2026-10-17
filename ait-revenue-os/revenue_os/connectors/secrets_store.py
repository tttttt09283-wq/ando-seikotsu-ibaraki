"""連携サービスのログイン情報の保存場所。

APIキー・トークン類は .env、Google のログイン情報（JSON）は .secrets/ に保存する。
どちらも .gitignore 済みで、本人だけが読める権限（600）にする。データベースには保存しない。
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from ..config import BASE_DIR

SECRETS_DIR = Path(os.getenv("AIT_SECRETS_DIR") or BASE_DIR / ".secrets")


def _path(name: str) -> Path:
    return SECRETS_DIR / name


def save_json(name: str, data: dict) -> None:
    SECRETS_DIR.mkdir(parents=True, exist_ok=True)
    os.chmod(SECRETS_DIR, 0o700)
    p = _path(name)
    p.write_text(json.dumps(data), encoding="utf-8")
    os.chmod(p, 0o600)


def load_json(name: str) -> dict | None:
    p = _path(name)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def delete(name: str) -> None:
    p = _path(name)
    if p.exists():
        p.unlink()
