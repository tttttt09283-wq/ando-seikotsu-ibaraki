"""データベースのモデル定義（SQLAlchemy 2.0）。

日時はすべてパソコンの現地時刻（日本時間）で保存する。

方針:
- 金額はすべて「円の整数」で保存する（小数・浮動小数点の誤差を避ける）
- AIの分析・仮説と、人間が確認した事実は別の列・別の区分で保存する
- 外部サービスの情報（価格・報酬率・在庫）は、出典URLと確認日時を必ずセットで持つ
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now, nullable=False)


# ---------------------------------------------------------------------------
# 市場調査
# ---------------------------------------------------------------------------

VERIFICATION_STATUSES = ["未検証", "検証中", "確認済み", "却下"]


class ResearchTheme(TimestampMixin, Base):
    __tablename__ = "research_themes"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    target_reader: Mapped[str] = mapped_column(Text, default="")
    problem: Mapped[str] = mapped_column(Text, default="")
    competitor_notes: Mapped[str] = mapped_column(Text, default="")
    # AIや人間の「仮説」（未確認）
    hypothesis: Mapped[str] = mapped_column(Text, default="")
    # 人間が出典で確認した「事実」
    verified_facts: Mapped[str] = mapped_column(Text, default="")
    verification_status: Mapped[str] = mapped_column(String(20), default="未検証")
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)

    sources: Mapped[list[ResearchSource]] = relationship(
        back_populates="theme", cascade="all, delete-orphan", order_by="ResearchSource.id"
    )


class ResearchSource(TimestampMixin, Base):
    """出典。URLは人間が実際に確認したものだけを登録する（AIにURLを作らせない）。"""

    __tablename__ = "research_sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    theme_id: Mapped[int] = mapped_column(ForeignKey("research_themes.id", ondelete="CASCADE"))
    url: Mapped[str] = mapped_column(String(1000))
    title: Mapped[str] = mapped_column(String(300), default="")
    note: Mapped[str] = mapped_column(Text, default="")
    checked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    theme: Mapped[ResearchTheme] = relationship(back_populates="sources")


# ---------------------------------------------------------------------------
# note 商品
# ---------------------------------------------------------------------------

PRODUCT_STATUSES = ["企画中", "制作中", "販売中", "停止"]


class NoteProduct(TimestampMixin, Base):
    __tablename__ = "note_products"

    id: Mapped[int] = mapped_column(primary_key=True)
    theme_id: Mapped[int | None] = mapped_column(ForeignKey("research_themes.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(200))
    concept: Mapped[str] = mapped_column(Text, default="")
    free_article: Mapped[str] = mapped_column(Text, default="")
    paid_article: Mapped[str] = mapped_column(Text, default="")
    price_yen: Mapped[int] = mapped_column(Integer, default=0)
    sales_funnel: Mapped[str] = mapped_column(Text, default="")
    cta: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="企画中")
    # 公開・販売設定は人間が note 上で行い、そのURLをここに記録する
    public_url: Mapped[str] = mapped_column(String(1000), default="")
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)


# ---------------------------------------------------------------------------
# 楽天アフィリエイト商品（手動登録モード）
# ---------------------------------------------------------------------------

RAKUTEN_STATUSES = ["候補", "紹介中", "見送り"]


class RakutenItem(TimestampMixin, Base):
    __tablename__ = "rakuten_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(300))
    shop_name: Mapped[str] = mapped_column(String(200), default="")
    item_url: Mapped[str] = mapped_column(String(1000), default="")
    # 人間が楽天アフィリエイトの管理画面で取得したリンクを貼る
    affiliate_url: Mapped[str] = mapped_column(String(2000), default="")
    price_yen: Mapped[int | None] = mapped_column(Integer, nullable=True)
    price_source_url: Mapped[str] = mapped_column(String(1000), default="")
    price_checked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    commission_rate_pct: Mapped[float | None] = mapped_column(nullable=True)
    commission_source_url: Mapped[str] = mapped_column(String(1000), default="")
    commission_checked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    stock_note: Mapped[str] = mapped_column(String(200), default="")
    stock_checked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    intro_text: Mapped[str] = mapped_column(Text, default="")
    ad_disclosure: Mapped[str] = mapped_column(String(200), default="【PR】本記事には楽天アフィリエイトのリンクを含みます。")
    evaluation: Mapped[str] = mapped_column(Text, default="")  # AI・人間の評価メモ（仮説）
    status: Mapped[str] = mapped_column(String(20), default="候補")
    registration_mode: Mapped[str] = mapped_column(String(20), default="manual")
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)


# ---------------------------------------------------------------------------
# コンテンツと承認ワークフロー
# ---------------------------------------------------------------------------

CHANNELS = ["threads", "x", "note", "instagram", "facebook", "line", "gbp"]
CHANNEL_LABELS = {"threads": "Threads", "x": "X", "note": "note", "instagram": "Instagram", "facebook": "Facebook", "line": "LINE公式", "gbp": "Googleビジネスプロフィール"}

STATUS_DRAFT = "draft"
STATUS_REVIEW = "review"
STATUS_APPROVED = "approved"
STATUS_PUBLISHED = "published"
STATUS_REJECTED = "rejected"
CONTENT_STATUSES = [STATUS_DRAFT, STATUS_REVIEW, STATUS_APPROVED, STATUS_PUBLISHED, STATUS_REJECTED]
STATUS_LABELS = {
    STATUS_DRAFT: "下書き",
    STATUS_REVIEW: "レビュー待ち",
    STATUS_APPROVED: "承認済み",
    STATUS_PUBLISHED: "公開済み",
    STATUS_REJECTED: "却下",
}


class Content(TimestampMixin, Base):
    __tablename__ = "contents"

    id: Mapped[int] = mapped_column(primary_key=True)
    channel: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(300), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default=STATUS_DRAFT)
    note_product_id: Mapped[int | None] = mapped_column(ForeignKey("note_products.id", ondelete="SET NULL"), nullable=True)
    rakuten_item_id: Mapped[int | None] = mapped_column(ForeignKey("rakuten_items.id", ondelete="SET NULL"), nullable=True)
    ai_generated: Mapped[bool] = mapped_column(Boolean, default=False)
    public_url: Mapped[str] = mapped_column(String(1000), default="")
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)

    revisions: Mapped[list[ContentRevision]] = relationship(
        back_populates="content", cascade="all, delete-orphan", order_by="ContentRevision.id"
    )
    approval_events: Mapped[list[ApprovalEvent]] = relationship(
        back_populates="content", cascade="all, delete-orphan", order_by="ApprovalEvent.id"
    )


class ContentRevision(Base):
    """本文の修正履歴（保存のたびに1件）。"""

    __tablename__ = "content_revisions"

    id: Mapped[int] = mapped_column(primary_key=True)
    content_id: Mapped[int] = mapped_column(ForeignKey("contents.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(300), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    editor: Mapped[str] = mapped_column(String(50), default="社長")
    note: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    content: Mapped[Content] = relationship(back_populates="revisions")


class ApprovalEvent(Base):
    """承認キューでの状態変更の記録（誰が・いつ・何を・チェック内容）。"""

    __tablename__ = "approval_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    content_id: Mapped[int] = mapped_column(ForeignKey("contents.id", ondelete="CASCADE"))
    from_status: Mapped[str] = mapped_column(String(20))
    to_status: Mapped[str] = mapped_column(String(20))
    actor: Mapped[str] = mapped_column(String(50))
    comment: Mapped[str] = mapped_column(Text, default="")
    checklist_json: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    content: Mapped[Content] = relationship(back_populates="approval_events")


# ---------------------------------------------------------------------------
# 売上・指標・費用
# ---------------------------------------------------------------------------

SALES_SOURCES = ["note", "rakuten"]


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(20))
    filename: Mapped[str] = mapped_column(String(300))
    file_hash: Mapped[str] = mapped_column(String(64), index=True)
    mapping_json: Mapped[str] = mapped_column(Text, default="")
    rows_total: Mapped[int] = mapped_column(Integer, default=0)
    rows_imported: Mapped[int] = mapped_column(Integer, default=0)
    rows_duplicated: Mapped[int] = mapped_column(Integer, default=0)
    rows_error: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class SalesRecord(Base):
    """売上1件。note と楽天は source で分けて保存し、集計時に合算する。

    - gross_yen: 売上金額（note=販売価格、楽天=対象となった購入金額）
    - fee_yen: 手数料など差し引かれる額（note の手数料など）
    - revenue_yen: A.I.T company の受取額（note=売上−手数料、楽天=成果報酬額）
    """

    __tablename__ = "sales_records"
    __table_args__ = (UniqueConstraint("source", "dedupe_key", name="uq_sales_dedupe"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(20), index=True)
    order_date: Mapped[date] = mapped_column(Date, index=True)
    item_name: Mapped[str] = mapped_column(String(300), default="")
    external_id: Mapped[str] = mapped_column(String(200), default="")
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    gross_yen: Mapped[int] = mapped_column(Integer, default=0)
    fee_yen: Mapped[int] = mapped_column(Integer, default=0)
    revenue_yen: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(50), default="")
    dedupe_key: Mapped[str] = mapped_column(String(64))
    import_batch_id: Mapped[int | None] = mapped_column(ForeignKey("import_batches.id", ondelete="SET NULL"), nullable=True)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class ChannelMetric(Base):
    """CTR・CVR 計算用の指標（各サービスの管理画面の数値を人間が転記）。"""

    __tablename__ = "channel_metrics"
    __table_args__ = (UniqueConstraint("metric_date", "channel", name="uq_metric_day_channel"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    metric_date: Mapped[date] = mapped_column(Date, index=True)
    channel: Mapped[str] = mapped_column(String(20))  # note / rakuten / threads / x
    impressions: Mapped[int] = mapped_column(Integer, default=0)
    clicks: Mapped[int] = mapped_column(Integer, default=0)
    conversions: Mapped[int] = mapped_column(Integer, default=0)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)


EXPENSE_CATEGORIES = ["ツール・サブスク", "外注", "広告", "書籍・資料", "その他"]


class Expense(Base):
    __tablename__ = "expenses"

    id: Mapped[int] = mapped_column(primary_key=True)
    expense_date: Mapped[date] = mapped_column(Date, index=True)
    category: Mapped[str] = mapped_column(String(50))
    amount_yen: Mapped[int] = mapped_column(Integer)
    note: Mapped[str] = mapped_column(String(300), default="")
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)


class AIUsage(Base):
    """AI利用の記録。テンプレート生成（API未使用）も費用0円で記録する。"""

    __tablename__ = "ai_usage"

    id: Mapped[int] = mapped_column(primary_key=True)
    role: Mapped[str] = mapped_column(String(50))
    purpose: Mapped[str] = mapped_column(String(200))
    mode: Mapped[str] = mapped_column(String(20))  # api / template
    model: Mapped[str] = mapped_column(String(100), default="")
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_yen: Mapped[float] = mapped_column(default=0.0)
    error: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, index=True)


# ---------------------------------------------------------------------------
# チャド
# ---------------------------------------------------------------------------

TASK_STATUSES = ["未着手", "進行中", "完了"]


class Task(TimestampMixin, Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(300))
    role: Mapped[str] = mapped_column(String(50), default="チャド")
    priority: Mapped[int] = mapped_column(Integer, default=2)  # 1=高 2=中 3=低
    status: Mapped[str] = mapped_column(String(20), default="未着手")
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    note: Mapped[str] = mapped_column(Text, default="")
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)


class DailyReport(Base):
    __tablename__ = "daily_reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    report_date: Mapped[date] = mapped_column(Date, index=True)
    facts_md: Mapped[str] = mapped_column(Text)  # DBから集計した確認済みの実績
    suggestions_md: Mapped[str] = mapped_column(Text)  # AI・テンプレートの改善提案（仮説）
    priorities_md: Mapped[str] = mapped_column(Text)
    generated_by: Mapped[str] = mapped_column(String(20))  # api / template
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


# ---------------------------------------------------------------------------
# Threads（公式API）・予約投稿・分析
# ---------------------------------------------------------------------------

SCHEDULE_STATUSES = ["scheduled", "publishing", "published", "failed", "cancelled"]
SCHEDULE_LABELS = {"scheduled": "予約中", "publishing": "投稿処理中", "published": "投稿済み", "failed": "失敗", "cancelled": "取り消し"}


class ScheduledPost(TimestampMixin, Base):
    """承認済みコンテンツの予約投稿。社長が予約した時だけ作られる。"""

    __tablename__ = "scheduled_posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    content_id: Mapped[int] = mapped_column(ForeignKey("contents.id", ondelete="CASCADE"), index=True)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    status: Mapped[str] = mapped_column(String(20), default="scheduled", index=True)
    # 二重投稿防止：作成済みのコンテナIDを保持し、再試行では同じコンテナを公開する
    container_id: Mapped[str] = mapped_column(String(100), default="")
    threads_id: Mapped[str] = mapped_column(String(100), default="")
    permalink: Mapped[str] = mapped_column(String(1000), default="")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str] = mapped_column(Text, default="")
    locked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    scheduled_by: Mapped[str] = mapped_column(String(50), default="社長")


class ThreadsPost(TimestampMixin, Base):
    """Threads の投稿（APIで取得・予約投稿・手動記録）。"""

    __tablename__ = "threads_posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    threads_id: Mapped[str] = mapped_column(String(100), unique=True)
    content_id: Mapped[int | None] = mapped_column(ForeignKey("contents.id", ondelete="SET NULL"), nullable=True)
    note_product_id: Mapped[int | None] = mapped_column(ForeignKey("note_products.id", ondelete="SET NULL"), nullable=True)
    text: Mapped[str] = mapped_column(Text, default="")
    permalink: Mapped[str] = mapped_column(String(1000), default="")
    posted_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    media_type: Mapped[str] = mapped_column(String(30), default="TEXT")
    source: Mapped[str] = mapped_column(String(20), default="api")  # api / scheduled / manual
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)

    insights: Mapped[list[ThreadsInsight]] = relationship(back_populates="post", cascade="all, delete-orphan", order_by="ThreadsInsight.fetched_at")


class ThreadsInsight(Base):
    """投稿の反応数のスナップショット（取得するたびに1件追加）。"""

    __tablename__ = "threads_insights"

    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("threads_posts.id", ondelete="CASCADE"), index=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    views: Mapped[int] = mapped_column(Integer, default=0)
    likes: Mapped[int] = mapped_column(Integer, default=0)
    replies: Mapped[int] = mapped_column(Integer, default=0)
    reposts: Mapped[int] = mapped_column(Integer, default=0)
    quotes: Mapped[int] = mapped_column(Integer, default=0)
    shares: Mapped[int] = mapped_column(Integer, default=0)

    post: Mapped[ThreadsPost] = relationship(back_populates="insights")


class AccountMetric(Base):
    __tablename__ = "account_metrics"
    __table_args__ = (UniqueConstraint("metric_date", "platform", name="uq_account_metric"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    metric_date: Mapped[date] = mapped_column(Date)
    platform: Mapped[str] = mapped_column(String(20), default="threads")
    followers: Mapped[int] = mapped_column(Integer, default=0)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)


class AppSetting(Base):
    """画面から変更できる運用設定（秘密情報は保存しない）。"""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")


# ---------------------------------------------------------------------------
# 集客ハブ（チャネル別KPI・口コミ・検索対策）
# ---------------------------------------------------------------------------


class ChannelKPI(Base):
    """チャネルごとの指標（縦持ち）。各サービスの管理画面の数字を転記、または公式APIで取得。"""

    __tablename__ = "channel_kpis"
    __table_args__ = (UniqueConstraint("metric_date", "channel", "metric_key", name="uq_channel_kpi"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    metric_date: Mapped[date] = mapped_column(Date, index=True)
    channel: Mapped[str] = mapped_column(String(30), index=True)
    metric_key: Mapped[str] = mapped_column(String(50))
    value: Mapped[float] = mapped_column(default=0.0)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)


class Review(TimestampMixin, Base):
    """口コミ。返信は下書きまで作り、Googleマップ等への返信は人間が行う。"""

    __tablename__ = "reviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    platform: Mapped[str] = mapped_column(String(30), default="google")
    review_date: Mapped[date] = mapped_column(Date, index=True)
    rating: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text, default="")
    reply_draft: Mapped[str] = mapped_column(Text, default="")
    replied: Mapped[bool] = mapped_column(Boolean, default=False)
    replied_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)


SEARCH_KINDS = {"seo": "Web検索（SEO）", "meo": "Googleマップ（MEO）", "aio": "AI検索（AIO）"}


class SearchKeyword(TimestampMixin, Base):
    __tablename__ = "search_keywords"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(10))  # seo / meo / aio
    keyword: Mapped[str] = mapped_column(String(200))
    target: Mapped[str] = mapped_column(String(500), default="")  # 表示させたいページ・店舗名
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)

    checks: Mapped[list[SearchCheck]] = relationship(back_populates="keyword", cascade="all, delete-orphan", order_by="SearchCheck.checked_at")


class SearchCheck(Base):
    """検索結果の確認記録。順位（SEO・MEO）や AI の回答で言及されたか（AIO）を人間が確認して記録する。"""

    __tablename__ = "search_checks"

    id: Mapped[int] = mapped_column(primary_key=True)
    keyword_id: Mapped[int] = mapped_column(ForeignKey("search_keywords.id", ondelete="CASCADE"), index=True)
    checked_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    rank: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 圏外は None
    mentioned: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # AIO
    engine: Mapped[str] = mapped_column(String(50), default="")  # Google / Googleマップ / ChatGPT / Gemini など
    memo: Mapped[str] = mapped_column(String(500), default="")

    keyword: Mapped[SearchKeyword] = relationship(back_populates="checks")


class NoteArticle(TimestampMixin, Base):
    """note の公式RSSから取り込んだ記事。"""

    __tablename__ = "note_articles"

    id: Mapped[int] = mapped_column(primary_key=True)
    url: Mapped[str] = mapped_column(String(1000), unique=True)
    title: Mapped[str] = mapped_column(String(500))
    summary: Mapped[str] = mapped_column(Text, default="")
    published_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    note_product_id: Mapped[int | None] = mapped_column(ForeignKey("note_products.id", ondelete="SET NULL"), nullable=True)
    promo_draft_created: Mapped[bool] = mapped_column(Boolean, default=False)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)
