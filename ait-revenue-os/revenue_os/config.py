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

    @property
    def ai_enabled(self) -> bool:
        return bool(self.anthropic_api_key)


def get_settings() -> Settings:
    db = os.getenv("AIT_DB_PATH") or str(BASE_DIR / "data" / "ait_revenue.db")
    return Settings(
        anthropic_api_key=os.getenv("ANTHROPIC_API_KEY") or None,
        model=os.getenv("AIT_MODEL") or "claude-opus-5-5",
        ai_daily_budget_yen=_int("AIT_AI_DAILY_BUDGET_YEN", 300),
        usd_jpy=_float("AIT_USD_JPY", 150.0),
        db_path=Path(db),
    )
