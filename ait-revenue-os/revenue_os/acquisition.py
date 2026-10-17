"""集客ハブ：SNS・Googleマップ（MEO）・Web検索（SEO）・AI検索（AIO）・口コミ・販売チャネルを1か所で管理する。

連携の方式：
- Threads … 公式API（接続時）またはアプリ内の記録から自動集計
- note・楽天 … 売上CSVから自動集計 ＋ 管理画面の数字を転記
- Instagram・X・LINE公式・Facebook・Googleビジネスプロフィール・Search Console … 各管理画面の数字を転記（手動記録）
- AI検索 … ChatGPT・Gemini 等で自分で検索し、言及されたかを記録
外部サービスへの自動投稿・自動返信・自動操作は行わない（Threads の予約投稿を除く）。

数字の入力ルール：「フォロワー数」などの累計は現在の値、「表示回数」などは各管理画面で『過去7日間』を選んだ合計を入れる。
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import get_settings
from .models import AccountMetric, ChannelKPI, Review, SalesRecord, SearchCheck, SearchKeyword, ThreadsInsight, ThreadsPost
from .threads_analytics import get_setting, set_setting

STALE_DAYS = 7


@dataclass(frozen=True)
class MetricDef:
    key: str
    label: str
    stock: bool = False  # True=累計（現在の値） False=過去7日間の合計
    lower_is_better: bool = False


@dataclass(frozen=True)
class ChannelDef:
    key: str
    name: str
    icon: str
    group: str
    metrics: tuple[MetricDef, ...]
    primary: str
    where: str  # 数字の確認場所
    auto: bool = False  # アプリ内のデータから自動集計できる


CHANNELS: tuple[ChannelDef, ...] = (
    ChannelDef("threads", "Threads", "🧵", "SNS", (MetricDef("followers", "フォロワー", True), MetricDef("views", "閲覧（7日）")), "views", "Threads運用画面（自動）", auto=True),
    ChannelDef("instagram", "Instagram", "📸", "SNS", (MetricDef("followers", "フォロワー", True), MetricDef("reach", "リーチ（7日）"), MetricDef("profile_visits", "プロフィールアクセス（7日）"), MetricDef("link_taps", "リンクのタップ（7日）")), "reach", "Instagramアプリ › プロフェッショナルダッシュボード"),
    ChannelDef("x", "X", "✖️", "SNS", (MetricDef("followers", "フォロワー", True), MetricDef("impressions", "インプレッション（7日）"), MetricDef("profile_visits", "プロフィール訪問（7日）"), MetricDef("link_clicks", "リンククリック（7日）")), "impressions", "X › アナリティクス"),
    ChannelDef("line", "LINE公式", "💬", "SNS", (MetricDef("friends", "友だち", True), MetricDef("opens", "メッセージ開封（7日）"), MetricDef("clicks", "クリック（7日）")), "friends", "LINE公式アカウントの管理画面 › 分析"),
    ChannelDef("facebook", "Facebook", "📘", "SNS", (MetricDef("followers", "フォロワー", True), MetricDef("reach", "リーチ（7日）"), MetricDef("clicks", "クリック（7日）")), "reach", "Meta Business Suite › インサイト"),
    ChannelDef("gbp", "Googleマップ", "📍", "検索", (MetricDef("search_views", "検索での表示（7日）"), MetricDef("map_views", "マップでの表示（7日）"), MetricDef("directions", "ルート検索（7日）"), MetricDef("calls", "電話（7日）"), MetricDef("website_clicks", "Webサイトクリック（7日）")), "map_views", "Googleビジネスプロフィール › パフォーマンス"),
    ChannelDef("seo", "Web検索", "🔍", "検索", (MetricDef("impressions", "表示回数（7日）"), MetricDef("clicks", "クリック（7日）"), MetricDef("avg_position", "平均掲載順位", True, lower_is_better=True)), "clicks", "Google Search Console › 検索パフォーマンス"),
    ChannelDef("aio", "AI検索", "🤖", "検索", (MetricDef("mention_rate", "言及率（%）", True),), "mention_rate", "検索対策画面で記録（ChatGPT・Gemini・GoogleのAIによる概要など）", auto=True),
    ChannelDef("note", "note", "📒", "販売", (MetricDef("page_views", "記事の閲覧（7日）"), MetricDef("likes", "スキ（7日）"), MetricDef("articles", "公開記事（7日）"), MetricDef("sales", "販売件数（7日）")), "page_views", "note › ダッシュボード（記事は公式RSS・販売件数は売上CSVから自動）"),
    ChannelDef("rakuten", "楽天", "🛒", "販売", (MetricDef("clicks", "クリック（7日）"), MetricDef("reward_yen", "成果報酬（7日・円）")), "reward_yen", "楽天アフィリエイト › レポート（報酬は売上CSVから自動）"),
)
CHANNEL_BY_KEY = {c.key: c for c in CHANNELS}
AUTO_METRICS = {("threads", "followers"), ("threads", "views"), ("aio", "mention_rate"), ("note", "sales"), ("note", "articles"), ("rakuten", "reward_yen")}


def enabled_channels(session: Session) -> list[str]:
    raw = get_setting(session, "channels_enabled", "")
    if not raw:
        return [c.key for c in CHANNELS]
    keys = json.loads(raw)
    return [k for k in keys if k in CHANNEL_BY_KEY]


def set_enabled_channels(session: Session, keys: list[str]) -> None:
    set_setting(session, "channels_enabled", json.dumps([k for k in keys if k in CHANNEL_BY_KEY]))


# ---------------------------------------------------------------------------
# 記録
# ---------------------------------------------------------------------------


def record_kpis(session: Session, channel: str, day: date, values: dict[str, float | None], is_sample: bool = False) -> int:
    """指標を記録する（同じ日・同じ指標は上書き）。空欄（None）は記録しない。"""
    cdef = CHANNEL_BY_KEY[channel]
    valid = {m.key for m in cdef.metrics}
    n = 0
    for key, value in values.items():
        if key not in valid or value is None or (channel, key) in AUTO_METRICS:
            continue
        if value < 0:
            raise ValueError("数値は0以上で入力してください。")
        row = session.scalar(select(ChannelKPI).where(ChannelKPI.metric_date == day, ChannelKPI.channel == channel, ChannelKPI.metric_key == key))
        if row is None:
            session.add(ChannelKPI(metric_date=day, channel=channel, metric_key=key, value=float(value), is_sample=is_sample))
        else:
            row.value = float(value)
        n += 1
    return n


# ---------------------------------------------------------------------------
# 集計
# ---------------------------------------------------------------------------


@dataclass
class MetricValue:
    label: str
    value: float | None
    previous: float | None
    as_of: date | None
    lower_is_better: bool = False

    @property
    def delta_pct(self) -> float | None:
        if self.value is None or not self.previous:
            return None
        return (self.value - self.previous) / self.previous * 100

    @property
    def improving(self) -> bool | None:
        d = self.delta_pct
        if d is None or d == 0:
            return None
        return (d < 0) if self.lower_is_better else (d > 0)


def _auto_metric(session: Session, channel: str, key: str, day: date) -> tuple[float | None, float | None]:
    """アプリ内のデータから（今週, 先週）の値を出す。"""
    start = datetime.combine(day - timedelta(days=6), datetime.min.time())
    prev_start = start - timedelta(days=7)
    end = datetime.combine(day, datetime.max.time())
    if channel == "threads" and key == "views":

        def views(a, b):
            total = 0
            for p in session.scalars(select(ThreadsPost).where(ThreadsPost.posted_at >= a, ThreadsPost.posted_at <= b)):
                if p.insights:
                    total += p.insights[-1].views
            return total

        cur, prev = views(start, end), views(prev_start, start - timedelta(seconds=1))
        has = session.scalar(select(func.count(ThreadsInsight.id))) or 0
        return (float(cur) if has else None, float(prev) if has else None)
    if channel == "threads" and key == "followers":
        rows = session.execute(select(AccountMetric.followers).where(AccountMetric.platform == "threads").order_by(AccountMetric.metric_date.desc()).limit(8)).scalars().all()
        if not rows:
            return None, None
        return float(rows[0]), float(rows[-1]) if len(rows) > 1 else None
    if channel == "note" and key == "articles":
        from .models import NoteArticle

        def count(a, b):
            return float(session.scalar(select(func.count(NoteArticle.id)).where(NoteArticle.published_at >= a, NoteArticle.published_at <= b)) or 0)

        if not session.scalar(select(func.count(NoteArticle.id))):
            return None, None
        return count(start, end), count(prev_start, start - timedelta(seconds=1))
    if channel == "aio":
        return aio_mention_rate(session, day), aio_mention_rate(session, day - timedelta(days=7))
    if channel in ("note", "rakuten"):
        col = func.count(SalesRecord.id) if channel == "note" else func.coalesce(func.sum(SalesRecord.revenue_yen), 0)

        def total(a: date, b: date):
            return float(session.scalar(select(col).where(SalesRecord.source == channel, SalesRecord.order_date.between(a, b))) or 0)

        return total(day - timedelta(days=6), day), total(day - timedelta(days=13), day - timedelta(days=7))
    return None, None


def metric_values(session: Session, channel: str, day: date | None = None) -> list[MetricValue]:
    day = day or date.today()
    cdef = CHANNEL_BY_KEY[channel]
    out = []
    for m in cdef.metrics:
        if (channel, m.key) in AUTO_METRICS:
            cur, prev = _auto_metric(session, channel, m.key, day)
            out.append(MetricValue(m.label, cur, prev, day if cur is not None else None, m.lower_is_better))
            continue
        rows = session.execute(
            select(ChannelKPI.metric_date, ChannelKPI.value).where(ChannelKPI.channel == channel, ChannelKPI.metric_key == m.key, ChannelKPI.metric_date <= day).order_by(ChannelKPI.metric_date.desc()).limit(2)
        ).all()
        cur = rows[0] if rows else None
        prev = rows[1] if len(rows) > 1 else None
        out.append(MetricValue(m.label, cur[1] if cur else None, prev[1] if prev else None, cur[0] if cur else None, m.lower_is_better))
    return out


@dataclass
class ChannelStatus:
    cdef: ChannelDef
    mode: str  # API連携 / 自動集計 / 手動 / CSV＋手動 / 確認記録
    metrics: list[MetricValue]
    last_recorded: date | None
    issues: list[str] = field(default_factory=list)

    @property
    def primary(self) -> MetricValue:
        idx = [m.key for m in self.cdef.metrics].index(self.cdef.primary)
        return self.metrics[idx]

    @property
    def stale(self) -> bool:
        return self.last_recorded is None or (date.today() - self.last_recorded).days > STALE_DAYS


def channel_statuses(session: Session, day: date | None = None) -> list[ChannelStatus]:
    day = day or date.today()
    s = get_settings()
    from .connectors.sync import connection_status

    connected = connection_status(session)
    out = []
    for key in enabled_channels(session):
        cdef = CHANNEL_BY_KEY[key]
        mv = metric_values(session, key, day)
        manual_dates = [m.as_of for m, d in zip(mv, cdef.metrics, strict=True) if m.as_of and (key, d.key) not in AUTO_METRICS]
        auto_dates = [m.as_of for m, d in zip(mv, cdef.metrics, strict=True) if m.as_of and (key, d.key) in AUTO_METRICS]
        has_manual = any((key, d.key) not in AUTO_METRICS for d in cdef.metrics)
        last = max(manual_dates, default=None) if has_manual else max(auto_dates, default=None)
        if key == "threads":
            mode = "API連携" if s.threads_connected else "自動集計"
        elif key == "aio":
            mode = "確認記録"
        elif connected.get(key):
            mode = "RSS連携" if key == "note" else "API連携"
        elif cdef.auto:
            mode = "自動集計"
        else:
            mode = "手動" if key not in ("note", "rakuten") else "CSV＋手動"
        st = ChannelStatus(cdef, mode, mv, last)
        if st.stale:
            st.issues.append(f"{STALE_DAYS}日以上、数字が記録されていません（{cdef.where}）")
        p = st.primary
        if p.delta_pct is not None and p.improving is False and abs(p.delta_pct) >= 20:
            st.issues.append(f"{p.label}が前回より{abs(p.delta_pct):.0f}%悪化しています")
        out.append(st)
    return out


# ---------------------------------------------------------------------------
# 口コミ
# ---------------------------------------------------------------------------


def add_review(session: Session, platform: str, review_date: date, rating: int, text: str, is_sample: bool = False) -> Review:
    if not 1 <= rating <= 5:
        raise ValueError("評価は1〜5で入力してください。")
    r = Review(platform=platform, review_date=review_date, rating=rating, text=text.strip(), is_sample=is_sample)
    session.add(r)
    session.flush()
    return r


def mark_replied(session: Session, review: Review, reply_text: str) -> None:
    """返信は人間が Googleマップ等で行い、その内容をここに記録する。"""
    if not reply_text.strip():
        raise ValueError("返信した内容を入力してください。")
    review.reply_draft = reply_text.strip()
    review.replied = True
    review.replied_at = datetime.now()


@dataclass
class ReviewStats:
    count: int
    average: float | None
    unreplied: int
    low_unreplied: int
    last_30d: int


def review_stats(session: Session, platform: str | None = None) -> ReviewStats:
    q = select(Review)
    if platform:
        q = q.where(Review.platform == platform)
    rows = session.scalars(q).all()
    since = date.today() - timedelta(days=30)
    return ReviewStats(
        count=len(rows),
        average=round(sum(r.rating for r in rows) / len(rows), 2) if rows else None,
        unreplied=sum(1 for r in rows if not r.replied),
        low_unreplied=sum(1 for r in rows if not r.replied and r.rating <= 3),
        last_30d=sum(1 for r in rows if r.review_date >= since),
    )


# ---------------------------------------------------------------------------
# 検索対策（SEO・MEO・AIO）
# ---------------------------------------------------------------------------


def add_keyword(session: Session, kind: str, keyword: str, target: str = "", is_sample: bool = False) -> SearchKeyword:
    if kind not in ("seo", "meo", "aio"):
        raise ValueError("種類が正しくありません。")
    if not keyword.strip():
        raise ValueError("キーワードを入力してください。")
    k = SearchKeyword(kind=kind, keyword=keyword.strip(), target=target.strip(), is_sample=is_sample)
    session.add(k)
    session.flush()
    return k


def add_check(session: Session, kw: SearchKeyword, rank: int | None = None, mentioned: bool | None = None, engine: str = "", memo: str = "", checked_at: datetime | None = None) -> SearchCheck:
    if kw.kind == "aio" and mentioned is None:
        raise ValueError("AI検索では「言及されたか」を記録してください。")
    if rank is not None and rank < 1:
        raise ValueError("順位は1以上で入力してください（圏外は空欄）。")
    c = SearchCheck(keyword_id=kw.id, rank=rank, mentioned=mentioned, engine=engine, memo=memo, checked_at=checked_at or datetime.now())
    session.add(c)
    session.flush()
    return c


def aio_mention_rate(session: Session, day: date) -> float | None:
    """AI検索キーワードごとの「最新の確認」（指定日以前）のうち、言及された割合（%）。"""
    end = datetime.combine(day, datetime.max.time())
    latest = []
    for kw in session.scalars(select(SearchKeyword).where(SearchKeyword.kind == "aio", SearchKeyword.active.is_(True))):
        checks = [c for c in kw.checks if c.checked_at <= end and c.mentioned is not None]
        if checks:
            latest.append(checks[-1].mentioned)
    if not latest:
        return None
    return round(100 * sum(1 for x in latest if x) / len(latest), 1)


@dataclass
class KeywordRow:
    id: int
    kind: str
    keyword: str
    target: str
    last_check: datetime | None
    rank: int | None
    prev_rank: int | None
    mentioned: bool | None
    engine: str

    @property
    def stale(self) -> bool:
        return self.last_check is None or datetime.now() - self.last_check > timedelta(days=14)


def keyword_rows(session: Session, kind: str | None = None) -> list[KeywordRow]:
    q = select(SearchKeyword).where(SearchKeyword.active.is_(True)).order_by(SearchKeyword.kind, SearchKeyword.id)
    if kind:
        q = q.where(SearchKeyword.kind == kind)
    out = []
    for kw in session.scalars(q):
        last = kw.checks[-1] if kw.checks else None
        prev = kw.checks[-2] if len(kw.checks) > 1 else None
        out.append(KeywordRow(kw.id, kw.kind, kw.keyword, kw.target, last.checked_at if last else None, last.rank if last else None, prev.rank if prev else None, last.mentioned if last else None, last.engine if last else ""))
    return out


# ---------------------------------------------------------------------------
# AI分析に渡す事実（集客データ分析 → 課題の可視化 → 改善ポイント）
# ---------------------------------------------------------------------------


def acquisition_facts(session: Session, day: date | None = None) -> dict:
    day = day or date.today()
    chans = channel_statuses(session, day)
    rv = review_stats(session)
    kws = keyword_rows(session)
    issues: list[str] = []
    for c in chans:
        issues += [f"{c.cdef.name}：{i}" for i in c.issues]
    if rv.low_unreplied:
        issues.append(f"口コミ：評価3以下で未返信が{rv.low_unreplied}件")
    elif rv.unreplied:
        issues.append(f"口コミ：未返信が{rv.unreplied}件")
    worse = [k for k in kws if k.rank and k.prev_rank and k.rank > k.prev_rank]
    if worse:
        issues.append("検索順位が下がったキーワード：" + "、".join(f"{k.keyword}（{k.prev_rank}→{k.rank}位）" for k in worse[:3]))
    stale_kw = [k for k in kws if k.stale]
    if stale_kw:
        issues.append(f"検索の確認が14日以上されていないキーワード：{len(stale_kw)}件")
    not_mentioned = [k.keyword for k in kws if k.kind == "aio" and k.mentioned is False]
    if not_mentioned:
        issues.append("AI検索で言及されていない質問：" + "、".join(not_mentioned[:3]))
    return {
        "date": day.isoformat(),
        "channels": [
            {"name": c.cdef.name, "mode": c.mode, **{m.label: m.value for m in c.metrics}, "主要指標の変化率": None if c.primary.delta_pct is None else round(c.primary.delta_pct, 1)}
            for c in chans
        ],
        "reviews": {"件数": rv.count, "平均評価": rv.average, "未返信": rv.unreplied, "直近30日": rv.last_30d},
        "keywords": [{"種類": k.kind, "キーワード": k.keyword, "順位": k.rank, "前回順位": k.prev_rank, "AIで言及": k.mentioned} for k in kws],
        "issues": issues,
    }
