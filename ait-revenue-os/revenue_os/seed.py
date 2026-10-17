"""サンプルデータの投入・削除。

サンプルはすべて is_sample=True で保存し、画面上で「サンプル」と表示する。
本番の実績と混ざらないよう、ワンクリックでサンプルだけを削除できる。
サンプルの売上はCSV取り込みの動作確認用の架空データであり、実績ではない。
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .config import BASE_DIR
from .csv_import import PRESETS, import_sales
from .models import (
    ChannelMetric,
    Content,
    Expense,
    ImportBatch,
    NoteProduct,
    RakutenItem,
    ResearchSource,
    ResearchTheme,
    SalesRecord,
    Task,
)
from .workflow import HUMAN_ACTOR, create_content, submit_for_review

SAMPLE_DIR = BASE_DIR / "sample_data"


def has_sample(session: Session) -> bool:
    return session.scalar(select(ResearchTheme.id).where(ResearchTheme.is_sample.is_(True)).limit(1)) is not None


def seed_sample(session: Session, today: date | None = None) -> bool:
    """サンプルを投入する。既に投入済みなら何もしない（False）。"""
    if has_sample(session):
        return False
    today = today or date.today()
    now = datetime.now()

    theme = ResearchTheme(
        title="（サンプル）個人事業主の確定申告を AI で楽にする方法",
        target_reader="初めて確定申告をする副業・個人事業主",
        problem="何から手をつければよいか分からず、毎年ぎりぎりになる",
        competitor_notes="（サンプル）同テーマの有料記事は複数ある想定。価格帯は人間が note 上で確認して記入する。",
        hypothesis="【仮説】手順とチェックリストが1つにまとまっていれば、数百円で買う人がいる",
        verified_facts="",
        verification_status="検証中",
        is_sample=True,
    )
    session.add(theme)
    session.flush()
    session.add(ResearchSource(theme_id=theme.id, url="https://www.nta.go.jp/", title="国税庁（公式サイト）", note="（サンプル）一次情報の確認先の例", checked_at=now))

    product = NoteProduct(
        theme_id=theme.id,
        title="（サンプル）はじめての確定申告 AI活用チェックリスト",
        concept="申告の流れを10ステップに分け、AIに任せられる作業と人が確認すべき作業を整理する。",
        free_article="1. こんな人向け\n2. よくあるつまずき\n3. この記事で分かること",
        paid_article="1. 準備物リスト\n2. 10ステップの手順\n3. AIへの指示文テンプレート\n4. 最終チェックリスト",
        price_yen=780,
        sales_funnel="Threads で悩み共感 → note 無料部分 → 有料部分",
        cta="手順とテンプレートは有料部分にまとめています。",
        status="制作中",
        is_sample=True,
    )
    session.add(product)

    item = RakutenItem(
        name="（サンプル）ノート型 家計簿・帳簿",
        shop_name="（サンプル）ショップ名",
        item_url="https://item.rakuten.co.jp/sample-shop/sample-item/",
        price_yen=1320,
        price_source_url="https://item.rakuten.co.jp/sample-shop/sample-item/",
        price_checked_at=now - timedelta(days=9),
        commission_rate_pct=None,
        stock_note="在庫あり（サンプル）",
        stock_checked_at=now - timedelta(days=9),
        intro_text="【PR】本記事には楽天アフィリエイトのリンクを含みます。\n（サンプル）帳簿をつける習慣づくりに使えるノートです。価格は確認日時点のものです。",
        evaluation="【仮説】確定申告の記事と相性が良い可能性",
        is_sample=True,
    )
    session.add(item)
    session.flush()

    c1 = create_content(
        session,
        "threads",
        "",
        "（サンプル）確定申告、毎年ぎりぎりになっていませんか？\n\n手順を10ステップに分けて、AIに任せられる作業と自分で確認する作業を整理しました。\n詳しくは note にまとめています（リンク）",
        actor="マーケティングAI",
        ai_generated=True,
        note_product_id=product.id,
        is_sample=True,
    )
    submit_for_review(session, c1, "マーケティングAI")
    create_content(
        session,
        "x",
        "",
        "（サンプル）帳簿づけを続けるコツは「書く場所を1つに決めること」。おすすめのノートはこちら（リンク）",
        actor="マーケティングAI",
        ai_generated=True,
        rakuten_item_id=item.id,
        is_sample=True,
    )

    for i in range(14):
        d = today - timedelta(days=i)
        for ch, imp, clk, conv in (("note", 300 + i * 7, 9 + i % 4, 1 if i % 5 == 0 else 0), ("rakuten", 0, 6 + i % 3, 1 if i % 6 == 0 else 0)):
            session.add(ChannelMetric(metric_date=d, channel=ch, impressions=imp, clicks=clk, conversions=conv, is_sample=True))
    session.add(Expense(expense_date=today.replace(day=1), category="ツール・サブスク", amount_yen=1500, note="（サンプル）画像作成ツール", is_sample=True))

    session.add(Task(title="（サンプル）調査テーマの出典を確認する", role="市場調査AI", priority=2, due_date=today + timedelta(days=1), is_sample=True))

    # サンプルCSV（日付を今日基準にずらして取り込む）
    for source in ("note", "rakuten"):
        path = SAMPLE_DIR / f"sample_{source}_sales.csv"
        data = _shift_sample_dates(path, today)
        import_sales(session, source, path.name, data, next(iter(PRESETS[source].values())), is_sample=True)
    return True


def _shift_sample_dates(path: Path, today: date) -> bytes:
    """サンプルCSV内の {D-n} を「今日の n 日前」に置き換える。"""
    text = path.read_text(encoding="utf-8")
    for n in range(0, 40):
        text = text.replace(f"{{D-{n}}}", (today - timedelta(days=n)).strftime("%Y/%m/%d"))
    return text.encode("utf-8")


def delete_sample(session: Session) -> None:
    sample_batches = select(SalesRecord.import_batch_id).where(SalesRecord.is_sample.is_(True))
    batch_ids = {b for b in session.scalars(sample_batches) if b}
    for model in (SalesRecord, ChannelMetric, Expense, Task, Content, RakutenItem, NoteProduct, ResearchTheme):
        session.execute(delete(model).where(model.is_sample.is_(True)))
    if batch_ids:
        session.execute(delete(ImportBatch).where(ImportBatch.id.in_(batch_ids)))
