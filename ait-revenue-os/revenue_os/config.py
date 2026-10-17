"""設定の読み込み。秘密情報は .env からのみ読み込み、コードやDBには保存しない。"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, "") or default)
    except ValueError:
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, "") or default)
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    anthropic_api_key: str | None
    model: str
    ai_daily_budget_yen: int
    usd_jpy: float
    db_path: Path
    # Threads（公式API）
    threads_access_token: str | None = None
    threads_api_base: str = "https://graph.threads.net/v1.0"
    threads_token_issued_at: str | None = None
    threads_posting_enabled: bool = False
    threads_daily_limit: int = 5
    threads_min_interval_min: int = 60
    threads_publish_wait_sec: int = 30
    # Instagram（読み取りのみ）
    instagram_access_token: str | None = None
    instagram_token_issued_at: str | None = None
    instagram_api_base: str = "https://graph.instagram.com"

    @property
    def ai_enabled(self) -> bool:
        return bool(self.anthropic_api_key)

    @property
    def threads_connected(self) -> bool:
        return bool(self.threads_access_token)


def get_settings() -> Settings:
    db = os.getenv("AIT_DB_PATH") or str(BASE_DIR / "data" / "ait_revenue.db")
    return Settings(
        anthropic_api_key=os.getenv("ANTHROPIC_API_KEY") or None,
        model=os.getenv("AIT_MODEL") or "claude-opus-5-5",
        ai_daily_budget_yen=_int("AIT_AI_DAILY_BUDGET_YEN", 300),
        usd_jpy=_float("AIT_USD_JPY", 150.0),
        db_path=Path(db),
        threads_access_token=os.getenv("THREADS_ACCESS_TOKEN") or None,
        threads_api_base=(os.getenv("THREADS_API_BASE") or "https://graph.threads.net/v1.0").rstrip("/"),
        threads_token_issued_at=os.getenv("THREADS_TOKEN_ISSUED_AT") or None,
        threads_posting_enabled=(os.getenv("AIT_THREADS_POSTING_ENABLED", "false").strip().lower() in ("1", "true", "yes", "on")),
        threads_daily_limit=max(0, min(_int("AIT_THREADS_DAILY_LIMIT", 5), 50)),
        threads_min_interval_min=max(10, _int("AIT_THREADS_MIN_INTERVAL_MIN", 60)),
        threads_publish_wait_sec=max(0, _int("AIT_THREADS_PUBLISH_WAIT_SEC", 30)),
        instagram_access_token=os.getenv("INSTAGRAM_ACCESS_TOKEN") or None,
        instagram_token_issued_at=os.getenv("INSTAGRAM_TOKEN_ISSUED_AT") or None,
        instagram_api_base=(os.getenv("INSTAGRAM_API_BASE") or "https://graph.instagram.com").rstrip("/"),
    )


ENV_PATH = BASE_DIR / ".env"


def save_env_value(key: str, value: str) -> None:
    """.env の値を書き換える（Threads トークン更新用）。.env 以外には秘密情報を保存しない。"""
    from dotenv import set_key

    if not ENV_PATH.exists():
        ENV_PATH.touch(mode=0o600)
    set_key(str(ENV_PATH), key, value, quote_mode="never")
    os.environ[key] = value
