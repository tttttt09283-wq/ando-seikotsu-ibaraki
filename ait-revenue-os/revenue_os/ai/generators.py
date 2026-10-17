"""各AI社員の生成機能。それぞれ「JSONスキーマ」「プロンプト」「テンプレート（API未使用時）」を持つ。

テンプレートも AI と同じルールに従う：架空の事実・体験・数字・URLは作らず、入力をもとに「たたき台」を作る。
生成物はすべて下書き・仮説として保存され、人間の確認と承認を経るまで公開されない。
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from .client import AIResult, generate


def _obj(props: dict[str, Any]) -> dict:
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}


_STR = {"type": "string"}
_STRS = {"type": "array", "items": {"type": "string"}}


# ---------------------------------------------------------------------------
# 市場調査AI
# ---------------------------------------------------------------------------

RESEARCH_SCHEMA = _obj({"hypotheses": _STRS, "verify_questions": _STRS, "search_keywords": _STRS})


def research_hypotheses(session: Session, title: str, target: str, problem: str, **kw) -> AIResult:
    prompt = (
        "次のテーマについて、需要の仮説・確認すべき問い・人間が調べるための検索キーワードを出してください。"
        "URLや統計値は書かないでください（出典は人間が確認して登録します）。\n"
        f"テーマ：{title}\n想定読者：{target or '未設定'}\n読者の課題：{problem or '未設定'}"
    )

    def template() -> dict:
        reader = target or "想定読者"
        return {
            "hypotheses": [
                f"【仮説】{reader}は「{problem or title}」を自力で解決する手順を知らず、まとまった解説にお金を払う可能性がある",
                f"【仮説】無料の情報は断片的なため、{reader}は一つにまとまったチェックリスト・テンプレートを求めている",
                "【仮説】価格は低め（数百円〜千円台）から試すほうが、最初の購入につながりやすい",
            ],
            "verify_questions": [
                f"「{title}」について、note で既に販売されている記事はあるか・価格帯はいくらか",
                "読者がこの課題を検索するときに使う言葉は何か",
                "無料で手に入る情報と比べて、有料にする価値（時間短縮・具体例など）は何か",
            ],
            "search_keywords": [title, f"{title} やり方", f"{title} 初心者", f"{title} テンプレート"],
        }

    return generate(session, "市場調査AI", f"需要仮説：{title}", prompt, RESEARCH_SCHEMA, template, **kw)


# ---------------------------------------------------------------------------
# 商品開発AI
# ---------------------------------------------------------------------------

NOTE_PLAN_SCHEMA = _obj(
    {
        "title": _STR,
        "concept": _STR,
        "free_outline": _STR,
        "paid_outline": _STR,
        "price_hypothesis": _STR,
        "funnel": _STR,
        "cta": _STR,
    }
)


def note_product_plan(session: Session, theme_title: str, target: str, problem: str, verified_facts: str, **kw) -> AIResult:
    prompt = (
        "次の調査結果をもとに、note で販売するデジタル商品（有料記事）を1つ設計してください。"
        "価格は根拠を添えた仮説として書き、売上見込みや実績は書かないでください。\n"
        f"テーマ：{theme_title}\n想定読者：{target}\n課題：{problem}\n確認済みの事実：{verified_facts or 'なし（すべて仮説扱い）'}"
    )

    def template() -> dict:
        return {
            "title": f"{theme_title}｜初心者向け 実践ガイド",
            "concept": f"{target or '読者'}が「{problem or theme_title}」を一人で進められるよう、手順とチェックリストをまとめる。",
            "free_outline": "1. こんな人向け\n2. よくあるつまずき\n3. この記事で分かること（目次）\n4. 有料部分の紹介",
            "paid_outline": "1. 準備するもの\n2. 手順（ステップごと）\n3. チェックリスト\n4. よくある質問\n5. すぐ使えるテンプレート",
            "price_hypothesis": "【仮説】最初は 500〜980円 で反応を見る。根拠：初めての購入のハードルを下げるため（要検証）。",
            "funnel": "Threads・X で課題に共感する投稿 → note 無料部分 → 有料部分の購入",
            "cta": "続きの手順とテンプレートは有料部分にまとめています。必要な方だけどうぞ。",
        }

    return generate(session, "商品開発AI", f"note商品設計：{theme_title}", prompt, NOTE_PLAN_SCHEMA, template, **kw)


RAKUTEN_EVAL_SCHEMA = _obj({"fit_points": _STRS, "risks": _STRS, "intro_text": _STR})


def rakuten_evaluation(session: Session, item: dict, **kw) -> AIResult:
    prompt = (
        "次の楽天商品（人間が登録した情報）を、紹介候補として評価してください。"
        "使用体験や効果は書かず、紹介文は商品ページの情報を伝える形にし、冒頭に【PR】を入れてください。\n"
        + json.dumps(item, ensure_ascii=False, default=str)
    )

    def template() -> dict:
        checked = item.get("price_checked_at") or "未確認"
        price = f"{item['price_yen']:,}円" if item.get("price_yen") else "（価格未登録）"
        return {
            "fit_points": ["【仮説】想定読者の課題と商品の用途が合っているか確認する", "【仮説】価格帯が読者にとって手に取りやすいか確認する"],
            "risks": ["価格・在庫・ポイントは変動するため、掲載前に最新情報を確認する", "効果・効能を断定する表現を使わない"],
            "intro_text": (
                "【PR】本記事には楽天アフィリエイトのリンクを含みます。\n"
                f"{item.get('name', '商品')}（{item.get('shop_name') or 'ショップ名未登録'}）\n"
                f"価格：{price}（{checked} 時点。最新の価格・在庫は販売ページでご確認ください）"
            ),
        }

    return generate(session, "商品開発AI", f"楽天商品評価：{item.get('name', '')}", prompt, RAKUTEN_EVAL_SCHEMA, template, **kw)


# ---------------------------------------------------------------------------
# マーケティングAI・営業AI
# ---------------------------------------------------------------------------

SNS_SCHEMA = _obj({"drafts": {"type": "array", "items": _obj({"channel": {"type": "string", "enum": ["threads", "x", "note"]}, "title": _STR, "body": _STR})}})


def sns_drafts(session: Session, subject: str, details: str, channels: list[str], affiliate: bool, **kw) -> AIResult:
    prompt = (
        f"次の内容を紹介する投稿の下書きを、{', '.join(channels)} 向けに1本ずつ作ってください。"
        "X は全角140字以内、Threads は500字以内を目安にしてください。"
        + ("アフィリエイトを含むため、冒頭に【PR】を入れてください。リンクは本文に「（リンク）」と書くだけにしてください。" if affiliate else "")
        + f"\n紹介する内容：{subject}\n詳細：{details}"
    )

    def template() -> dict:
        pr = "【PR】" if affiliate else ""
        return {
            "drafts": [
                {
                    "channel": ch,
                    "title": subject if ch == "note" else "",
                    "body": {
                        "x": f"{pr}{subject}について、つまずきやすい点を整理しました。詳しくはこちら（リンク）",
                        "threads": f"{pr}{subject}\n\nこんなことで困っていませんか？\n・やり方が分からない\n・何から始めればいいか迷う\n\n手順をまとめたので、必要な方はどうぞ（リンク）",
                        "note": f"{pr}\n## はじめに\n{details or subject}\n\n## こんな人に向けた記事です\n\n## この記事で分かること\n",
                    }[ch],
                }
                for ch in channels
            ]
        }

    return generate(session, "マーケティングAI", f"投稿下書き：{subject}", prompt, SNS_SCHEMA, template, **kw)


CTA_SCHEMA = _obj({"funnel_steps": _STRS, "ctas": _STRS})


def sales_cta(session: Session, product_title: str, concept: str, price_yen: int, **kw) -> AIResult:
    prompt = (
        "次の note 商品の販売導線（知る→興味→購入）と、押し売りにならないCTA案を出してください。"
        "DMでの勧誘や限定・残りわずか等の煽りは使わないでください。\n"
        f"商品：{product_title}\n内容：{concept}\n価格：{price_yen}円"
    )

    def template() -> dict:
        return {
            "funnel_steps": ["知る：SNSで読者の悩みに寄り添う投稿", "興味：note 無料部分で全体像と目次を見せる", "購入：有料部分で具体的な手順・テンプレートを提供"],
            "ctas": ["続きの手順は有料部分にまとめています。", "テンプレートが必要な方はこちらからどうぞ。", "まずは無料部分だけでも参考にしてください。"],
        }

    return generate(session, "営業AI", f"販売導線：{product_title}", prompt, CTA_SCHEMA, template, **kw)


# ---------------------------------------------------------------------------
# 経理分析AI・品質管理AI
# ---------------------------------------------------------------------------

INSIGHT_SCHEMA = _obj({"observations": _STRS, "suggestions": _STRS})


def accounting_insight(session: Session, kpi_facts: dict, **kw) -> AIResult:
    prompt = (
        "次の実績データ（確認済みの事実）を読み、気づき（事実に基づく）と改善提案（仮説）を出してください。"
        "入力にない数字は作らないでください。\n" + json.dumps(kpi_facts, ensure_ascii=False)
    )

    def template() -> dict:
        obs = [f"受取額合計 {kpi_facts.get('revenue_yen', 0):,}円、費用 {kpi_facts.get('cost_yen', 0):,.0f}円"]
        sug = []
        if not kpi_facts.get("orders"):
            sug.append("【仮説】まだ売上がないため、まず1件目の販売に向けて商品ページと導線を整える")
        if kpi_facts.get("ctr") is not None and kpi_facts["ctr"] < 0.01:
            sug.append("【仮説】CTRが1%未満のため、投稿の冒頭（1行目）を見直す")
        if kpi_facts.get("cvr") is not None and kpi_facts["cvr"] < 0.01:
            sug.append("【仮説】CVRが1%未満のため、無料部分の説明と価格のバランスを見直す")
        return {"observations": obs, "suggestions": sug or ["【仮説】数字が出そろうまで、指標の記録を続ける"]}

    return generate(session, "経理分析AI", "KPI分析", prompt, INSIGHT_SCHEMA, template, **kw)


QUALITY_SCHEMA = _obj({"issues": {"type": "array", "items": _obj({"severity": {"type": "string", "enum": ["要修正", "要確認"]}, "message": _STR})}, "summary": _STR})


def quality_review(session: Session, channel: str, title: str, body: str, **kw) -> AIResult:
    prompt = (
        "次の下書きを、事実確認・広告表示（ステルスマーケティング規制）・誇大表現・架空の体験・投稿先の規約の観点でチェックしてください。"
        "法令や規約の条文を断定的に引用せず、人間が確認すべき点として指摘してください。\n"
        f"投稿先：{channel}\nタイトル：{title}\n本文：\n{body}"
    )

    def template() -> dict:
        from ..quality import check_content

        found = check_content(channel, title, body)
        return {"issues": [{"severity": f.severity, "message": f.message} for f in found], "summary": "ルールによる自動チェックの結果です。" if found else "ルールチェックでは指摘はありませんでした。"}

    return generate(session, "品質管理AI", f"品質チェック：{title or channel}", prompt, QUALITY_SCHEMA, template, **kw)


# ---------------------------------------------------------------------------
# チャド
# ---------------------------------------------------------------------------

CHAD_SCHEMA = _obj(
    {
        "suggestions": _STRS,
        "priorities": {"type": "array", "items": _obj({"title": _STR, "role": {"type": "string", "enum": ["チャド", "市場調査AI", "商品開発AI", "マーケティングAI", "営業AI", "経理分析AI", "品質管理AI", "社長"]}, "priority": {"type": "integer", "enum": [1, 2, 3]}})},
    }
)


def chad_daily(session: Session, facts: dict, **kw) -> AIResult:
    prompt = (
        "あなたはチャドです。次の本日の実績（確認済みの事実）を読み、改善提案（仮説として）と、"
        "明日の優先タスクを3つまで出してください。社長の時間を守り、売上に近い作業を優先してください。\n"
        + json.dumps(facts, ensure_ascii=False, default=str)
    )

    def template() -> dict:
        pr: list[dict] = []
        if facts.get("review_waiting"):
            pr.append({"title": f"レビュー待ちのコンテンツ {facts['review_waiting']}件を確認・承認する", "role": "社長", "priority": 1})
        if facts.get("approved_unpublished"):
            pr.append({"title": f"承認済み {facts['approved_unpublished']}件を公開し、公開URLを記録する", "role": "社長", "priority": 1})
        if not facts.get("orders_30d"):
            pr.append({"title": "最初の1件を売るため、販売中の note 商品の導線を見直す", "role": "営業AI", "priority": 1})
        if facts.get("unverified_themes"):
            pr.append({"title": f"未検証の調査テーマ {facts['unverified_themes']}件の出典を確認する", "role": "市場調査AI", "priority": 2})
        if facts.get("stale_rakuten"):
            pr.append({"title": f"確認日時が7日以上前の楽天商品 {facts['stale_rakuten']}件の価格を再確認する", "role": "商品開発AI", "priority": 2})
        pr.append({"title": "売上CSVを取り込み、数字を最新にする", "role": "経理分析AI", "priority": 3})
        return {
            "suggestions": ["【仮説】承認待ちを溜めず、公開までの時間を短くすると、検証の回転が速くなる", "【仮説】売上が出るまでは、新しい商品を増やすより既存商品の導線改善を優先する"],
            "priorities": pr[:3],
        }

    return generate(session, "チャド", "日次報告", prompt, CHAD_SCHEMA, template, **kw)
