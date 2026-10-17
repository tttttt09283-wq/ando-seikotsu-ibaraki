"""「チャドに頼む」：ふだんの言葉の指示を、アプリの操作に変換して実行する。

実行するのはアプリの中の作業（数字の取得・下書き作成・分析・報告）だけ。
投稿・公開・返信の送信など外部への行動は、ここからは一切行わない（承認・予約は社長が画面で行う）。
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from .ai.client import generate
from .ai.generators import _obj, acquisition_analysis, review_reply, threads_improvement
from .acquisition import acquisition_facts
from .models import STATUS_REVIEW, Content, NoteProduct, Review
from .report import generate_daily_report
from .threads_analytics import analysis_facts, get_setting, posts_frame
from .today import build_today
from .workflow import create_content

EXAMPLES = [
    "今日やることは？",
    "数字を最新にして",
    "Threadsの投稿を3本作って",
    "口コミの返信案を作って",
    "集客を分析して",
    "日次報告を作って",
    "おまかせでまとめてやって",
]

INTENTS = ["omakase", "sync", "threads_drafts", "review_replies", "analysis", "daily_report", "today", "approvals", "help"]

_KANJI_NUM = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "１": 1, "２": 2, "３": 3, "４": 4, "５": 5}


@dataclass
class CommandResult:
    intent: str
    title: str
    lines: list[str] = field(default_factory=list)
    links: list[tuple[str, str]] = field(default_factory=list)  # (画面キー, ボタン名)
    ok: bool = True


def _count(text: str, default: int = 3) -> int:
    m = re.search(r"(\d+)\s*(本|件|個|つ)", text)
    if m:
        return max(1, min(int(m.group(1)), 5))
    for k, v in _KANJI_NUM.items():
        if f"{k}本" in text or f"{k}つ" in text or f"{k}件" in text:
            return v
    return default


def classify(text: str) -> str | None:
    t = unicodedata.normalize("NFKC", text)
    rules = [
        ("omakase", r"(おまかせ|お任せ|全部|まとめて|一括)"),
        ("review_replies", r"(口コミ|レビュー|クチコミ)"),
        ("threads_drafts", r"(threads|スレッズ|投稿).*(作|書|考|案)|(投稿案|下書き)"),
        ("sync", r"(同期|取得|最新|更新|取り込|数字を(取|集|入))"),
        ("daily_report", r"(日次|日報|報告書|報告を作|締め)"),
        ("analysis", r"(分析|改善|課題|伸び)"),
        ("approvals", r"(承認)"),
        ("today", r"(今日|やること|何を|なにを|タスク|予定)"),
    ]
    for intent, pat in rules:
        if re.search(pat, t, re.I):
            return intent
    return None


def _ai_classify(session: Session, text: str) -> str:
    schema = _obj({"intent": {"type": "string", "enum": INTENTS}})
    prompt = (
        "次の社長の指示を、アプリの操作の種類に分類してください。"
        "omakase=まとめて全部 / sync=数字の取得 / threads_drafts=Threads投稿案の作成 / review_replies=口コミ返信案 / "
        "analysis=集客の分析 / daily_report=日次報告 / today=今日やること / approvals=承認待ち / help=どれでもない\n"
        f"指示：{text}"
    )
    res = generate(session, "チャド", "指示の分類", prompt, schema, lambda: {"intent": "help"})
    return res.data.get("intent", "help")


# ---------------------------------------------------------------------------
# 各操作
# ---------------------------------------------------------------------------


def do_today(session: Session) -> CommandResult:
    plan = build_today(session)
    lines = [f"{'🔴' if i.priority == 1 else '🟠' if i.priority == 2 else '🟢'} {i.title}" for i in plan.items[:6]]
    if len(plan.items) > 6:
        lines.append(f"…ほか{len(plan.items) - 6}件")
    return CommandResult("today", f"今日やることは {len(plan.items)}件です" if plan.items else "今日やることはすべて終わっています 🎉", lines, [("today", "今日やることを開く")])


def do_sync(session: Session, **kw) -> CommandResult:
    from .connectors.sync import sync_all

    reports = sync_all(session, **kw)
    if not reports:
        return CommandResult("sync", "まだ自動取得できるサービスがつながっていません", ["「連携設定」から Threads・Instagram・Google をつなぐと、ここで一括取得できます。"], [("connect", "連携設定を開く")], ok=False)
    return CommandResult("sync", "数字を最新にしました", [f"{'✅' if r.ok else '⚠️'} {r.service}：{r.message}" for r in reports], [("hub", "集客ハブで見る")], ok=all(r.ok for r in reports))


def do_threads_drafts(session: Session, text: str = "", count: int | None = None) -> CommandResult:
    n = count or _count(text)
    product = None
    if "note" in text.lower() or "商品" in text:
        product = session.scalars(select(NoteProduct).where(NoteProduct.status != "停止").order_by(NoteProduct.status == "販売中", NoteProduct.id.desc())).first()
    prod = {"title": product.title, "concept": product.concept, "price_yen": product.price_yen, "cta": product.cta} if product else None
    res = threads_improvement(session, analysis_facts(posts_frame(session)), prod, count=n)
    made = 0
    for post in res.data.get("next_posts", [])[:n]:
        create_content(session, "threads", "", post["body"], actor="マーケティングAI", ai_generated=True, note_product_id=product.id if product else None)
        made += 1
    lines = [f"・{p['body'].splitlines()[0][:40]}" for p in res.data.get("next_posts", [])[:n]]
    if product:
        lines.insert(0, f"誘導先：{product.title}")
    lines.append(f"（{res.label}）確認してレビューに出し、承認後に予約してください。")
    return CommandResult("threads_drafts", f"Threads の下書きを{made}本作りました", lines, [("contents", "下書きを確認する")])


def do_review_replies(session: Session) -> CommandResult:
    business = get_setting(session, "business_name", "")
    targets = session.scalars(select(Review).where(Review.replied.is_(False), Review.reply_draft == "")).all()
    for r in targets:
        r.reply_draft = review_reply(session, r.rating, r.text, business).data.get("reply", "")
    pending = session.scalars(select(Review).where(Review.replied.is_(False))).all()
    if not pending:
        return CommandResult("review_replies", "未返信の口コミはありません", [], [("reviews", "口コミ対策を開く")])
    return CommandResult(
        "review_replies",
        f"口コミ {len(targets)}件の返信案を作りました（未返信 {len(pending)}件）",
        ["返信は Googleマップ等でご自身で投稿し、「返信済み」にしてください。"],
        [("reviews", "返信案を確認する")],
    )


def do_analysis(session: Session) -> CommandResult:
    res = acquisition_analysis(session, acquisition_facts(session))
    lines = [res.data.get("summary", "")]
    lines += [f"・{i.get('channel', '')}：{i.get('action', '')}" for i in res.data.get("improvements", [])[:5]]
    return CommandResult("analysis", "集客を分析しました", lines, [("hub", "集客ハブで詳しく見る")])


def do_daily_report(session: Session) -> CommandResult:
    report, notice = generate_daily_report(session)
    return CommandResult("daily_report", "日次報告を作りました", [report.priorities_md, notice], [("chad", "報告を見る")])


def do_approvals(session: Session) -> CommandResult:
    n = len(session.scalars(select(Content.id).where(Content.status == STATUS_REVIEW)).all())
    return CommandResult("approvals", f"承認待ちは {n}件です", [], [("approvals", "承認キューを開く")])


def do_omakase(session: Session, **kw) -> CommandResult:
    """社長の承認が不要な作業を、まとめて実行する。"""
    out = CommandResult("omakase", "まとめて実行しました", [])
    steps = [("数字の取得", lambda: do_sync(session, **kw)), ("口コミ返信案", lambda: do_review_replies(session))]
    plan = build_today(session)
    lack = max(0, plan.post_target - plan.posts_today - sum(1 for _, s, _ in plan.scheduled_today if s in ("scheduled", "publishing")))
    if lack:
        steps.append(("Threads下書き", lambda: do_threads_drafts(session, count=lack)))
    steps += [("集客分析", lambda: do_analysis(session)), ("日次報告", lambda: do_daily_report(session))]
    for name, fn in steps:
        try:
            r = fn()
            out.lines.append(f"{'✅' if r.ok else '⚠️'} {name}：{r.title}")
        except Exception as e:  # noqa: BLE001 - 1つ失敗しても他は続ける
            out.lines.append(f"⚠️ {name}：失敗しました（{e}）")
            out.ok = False
    out.lines.append("承認・予約・返信の送信など、社長の判断が必要なものは「今日やること」に並んでいます。")
    out.links = [("today", "今日やることを開く"), ("approvals", "承認キューを開く")]
    return out


def run_command(session: Session, text: str, **kw) -> CommandResult:
    text = (text or "").strip()
    if not text:
        return CommandResult("help", "指示を入力してください", [f"例：{e}" for e in EXAMPLES[:4]], ok=False)
    intent = classify(text)
    if intent is None:
        intent = _ai_classify(session, text)
    handlers = {
        "omakase": lambda: do_omakase(session, **kw),
        "sync": lambda: do_sync(session, **kw),
        "threads_drafts": lambda: do_threads_drafts(session, text),
        "review_replies": lambda: do_review_replies(session),
        "analysis": lambda: do_analysis(session),
        "daily_report": lambda: do_daily_report(session),
        "today": lambda: do_today(session),
        "approvals": lambda: do_approvals(session),
    }
    if intent in handlers:
        return handlers[intent]()
    return CommandResult("help", "ごめんなさい、その指示はまだ分かりません", ["次のように話しかけてください：", *[f"・{e}" for e in EXAMPLES]], ok=False)
