"""Anthropic API の呼び出し窓口。

- APIキーがない／1日の予算上限に達した／エラー時は、テンプレート生成に切り替える（画面は止めない）
- 返答は JSON スキーマで構造化して受け取る（output_config.format）
- すべての呼び出しを AIUsage に記録する（テンプレート生成は0円で記録）
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass

import anthropic
from sqlalchemy.orm import Session

from ..config import get_settings
from ..kpi import ai_cost_today
from ..models import AIUsage
from .roles import system_prompt

# 料金（米ドル / 100万トークン）。未登録モデルは最も高い単価で安全側に見積もる
PRICING_USD_PER_MTOK = {
    "claude-opus-5-5": (4.0, 20.0),
    "claude-sonnet-5-5": (2.0, 10.0),
    "claude-haiku-5-5": (0.10, 0.50),
    "claude-opus-5": (5.0, 25.0),
    "claude-opus-4-8": (5.0, 25.0),
    "claude-fable-5-1": (10.0, 50.0),
}
_UNKNOWN_PRICE = (10.0, 50.0)

# 拒否（refusal）時にサーバー側で別モデルへ切り替える機能に対応するモデル
_FALLBACK_MODELS = {"claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"}


@dataclass
class AIResult:
    data: dict
    mode: str  # "api" | "template"
    notice: str = ""

    @property
    def label(self) -> str:
        return "AI生成（要確認）" if self.mode == "api" else "テンプレート生成（APIキー未使用）"


def estimate_cost_yen(model: str, input_tokens: int, output_tokens: int, usd_jpy: float) -> float:
    pin, pout = PRICING_USD_PER_MTOK.get(model, _UNKNOWN_PRICE)
    usd = input_tokens / 1_000_000 * pin + output_tokens / 1_000_000 * pout
    return round(usd * usd_jpy, 2)


def _record(session: Session, role: str, purpose: str, mode: str, model: str = "", inp: int = 0, out: int = 0, cost: float = 0.0, error: str = "") -> None:
    session.add(AIUsage(role=role, purpose=purpose, mode=mode, model=model, input_tokens=inp, output_tokens=out, cost_yen=cost, error=error[:2000]))


def generate(
    session: Session,
    role: str,
    purpose: str,
    prompt: str,
    schema: dict,
    template: Callable[[], dict],
    client: anthropic.Anthropic | None = None,
) -> AIResult:
    settings = get_settings()

    def fallback(notice: str) -> AIResult:
        _record(session, role, purpose, "template", error=notice if notice.startswith("エラー") else "")
        return AIResult(template(), "template", notice)

    if not settings.ai_enabled and client is None:
        return fallback("APIキーが未設定のため、テンプレートで作成しました。")
    if ai_cost_today(session) >= settings.ai_daily_budget_yen:
        return fallback(f"本日のAI予算上限（¥{settings.ai_daily_budget_yen}）に達したため、テンプレートで作成しました。")

    client = client or anthropic.Anthropic(api_key=settings.anthropic_api_key, timeout=120.0, max_retries=2)
    kwargs: dict = {
        "model": settings.model,
        "max_tokens": 16000,
        "system": system_prompt(role),
        "messages": [{"role": "user", "content": prompt}],
        "output_config": {"effort": "medium", "format": {"type": "json_schema", "schema": schema}},
    }
    if settings.model in _FALLBACK_MODELS:
        kwargs["betas"] = ["server-side-fallback-2026-07-01"]
        kwargs["fallbacks"] = "default"

    try:
        response = client.beta.messages.create(**kwargs)
    except anthropic.AuthenticationError:
        return fallback("エラー：APIキーが正しくありません。.env の ANTHROPIC_API_KEY を確認してください。")
    except anthropic.PermissionDeniedError:
        return fallback("エラー：このAPIキーではこのモデルを利用できません。")
    except anthropic.NotFoundError:
        return fallback(f"エラー：モデル「{settings.model}」が見つかりません。.env の AIT_MODEL を確認してください。")
    except anthropic.RateLimitError:
        return fallback("エラー：利用上限に達しました。しばらく待ってから再度お試しください。")
    except anthropic.BadRequestError as e:
        return fallback(f"エラー：リクエストが受け付けられませんでした（{e.message}）。")
    except anthropic.APIStatusError as e:
        return fallback(f"エラー：AIサービスでエラーが発生しました（{e.status_code}）。")
    except anthropic.APIConnectionError:
        return fallback("エラー：インターネットに接続できませんでした。")

    usage = response.usage
    cost = estimate_cost_yen(response.model, usage.input_tokens, usage.output_tokens, settings.usd_jpy)
    if response.stop_reason == "refusal":
        _record(session, role, purpose, "api", response.model, usage.input_tokens, usage.output_tokens, cost, "refusal")
        return AIResult(template(), "template", "AIがこの依頼への回答を控えたため、テンプレートで作成しました。")
    if response.stop_reason == "max_tokens":
        _record(session, role, purpose, "api", response.model, usage.input_tokens, usage.output_tokens, cost, "max_tokens")
        return AIResult(template(), "template", "AIの回答が長すぎて途中で切れたため、テンプレートで作成しました。")
    text = next((b.text for b in response.content if b.type == "text"), "")
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        _record(session, role, purpose, "api", response.model, usage.input_tokens, usage.output_tokens, cost, "invalid_json")
        return AIResult(template(), "template", "AIの回答を読み取れなかったため、テンプレートで作成しました。")
    _record(session, role, purpose, "api", response.model, usage.input_tokens, usage.output_tokens, cost)
    return AIResult(data, "api", f"{response.model} で生成（推定費用 ¥{cost:.2f}）")
