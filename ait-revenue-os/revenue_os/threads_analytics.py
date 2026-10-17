"""Threads 投稿の分析と、note 販売までの導線（ファネル）。

- 数字はすべて Threads 公式API から取得した値、または人間が手入力した値
- 「どんな投稿が伸びたか」は投稿の特徴ごとの平均で示す（相関であり、因果ではない）
- 投稿数が少ないうちは「参考値」と明示する
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

import pandas as pd
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import AccountMetric, AppSetting, Content, NoteProduct, SalesRecord, ThreadsInsight, ThreadsPost
from .threads_api import ThreadsAPI, ThreadsAPIError, parse_timestamp

MIN_SAMPLES = 3  # 特徴ごとの比較で「参考値」扱いにする件数
INSIGHT_REFRESH = timedelta(hours=6)
WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"]

# ---------------------------------------------------------------------------
# 運用設定（秘密情報以外）
# ---------------------------------------------------------------------------


def get_setting(session: Session, key: str, default: str = "") -> str:
    row = session.get(AppSetting, key)
    return row.value if row else default


def set_setting(session: Session, key: str, value: str) -> None:
    row = session.get(AppSetting, key)
    if row is None:
        session.add(AppSetting(key=key, value=value))
    else:
        row.value = value


def daily_post_target(session: Session) -> int:
    try:
        return max(0, int(get_setting(session, "threads_daily_target", "2")))
    except ValueError:
        return 2


# ---------------------------------------------------------------------------
# 同期
# ---------------------------------------------------------------------------


@dataclass
class SyncResult:
    new_posts: int = 0
    updated_insights: int = 0
    followers: int | None = None
    errors: list[str] = field(default_factory=list)


def _link_content(session: Session, post: ThreadsPost) -> None:
    if post.content_id or not post.permalink:
        return
    c = session.scalar(select(Content).where(Content.public_url == post.permalink))
    if c:
        post.content_id, post.note_product_id = c.id, c.note_product_id


def sync_threads(session: Session, api: ThreadsAPI, now: datetime | None = None, limit: int = 100) -> SyncResult:
    """自分の投稿一覧と反応数を取り込む（手動投稿・予約投稿どちらも）。"""
    now = now or datetime.now()
    result = SyncResult()
    try:
        items = api.list_posts(limit)
    except ThreadsAPIError as e:
        result.errors.append(str(e))
        return result
    for it in items:
        if it.get("media_type") == "REPOST_FACADE" or not it.get("id"):
            continue
        post = session.scalar(select(ThreadsPost).where(ThreadsPost.threads_id == str(it["id"])))
        if post is None:
            post = ThreadsPost(
                threads_id=str(it["id"]),
                text=it.get("text", "") or "",
                permalink=it.get("permalink", "") or "",
                posted_at=parse_timestamp(it["timestamp"]) if it.get("timestamp") else now,
                media_type=it.get("media_type", "TEXT"),
                source="api",
            )
            session.add(post)
            result.new_posts += 1
        else:
            post.permalink = post.permalink or it.get("permalink", "")
        session.flush()
        _link_content(session, post)
        last = post.insights[-1].fetched_at if post.insights else None
        if post.posted_at >= now - timedelta(days=30) and (last is None or now - last >= INSIGHT_REFRESH):
            try:
                m = api.media_insights(post.threads_id)
            except ThreadsAPIError as e:
                result.errors.append(str(e))
                continue
            session.add(ThreadsInsight(post_id=post.id, fetched_at=now, **{k: m.get(k, 0) for k in ("views", "likes", "replies", "reposts", "quotes", "shares")}))
            result.updated_insights += 1
    try:
        followers = api.follower_count()
        if followers is not None:
            record_followers(session, now.date(), followers)
            result.followers = followers
    except ThreadsAPIError as e:
        result.errors.append(f"フォロワー数：{e}")
    set_setting(session, "threads_last_sync", now.isoformat(timespec="seconds"))
    return result


def record_followers(session: Session, day: date, followers: int, is_sample: bool = False) -> None:
    row = session.scalar(select(AccountMetric).where(AccountMetric.metric_date == day, AccountMetric.platform == "threads"))
    if row is None:
        session.add(AccountMetric(metric_date=day, platform="threads", followers=followers, is_sample=is_sample))
    else:
        row.followers = followers


def add_manual_post(session: Session, text: str, permalink: str, posted_at: datetime, metrics: dict[str, int], note_product_id: int | None = None) -> ThreadsPost:
    """APIを使わない場合：Threadsアプリのインサイト画面の数字を手入力する。"""
    key = permalink or f"manual-{posted_at.isoformat()}-{hashlib.sha256(text.encode()).hexdigest()[:8]}"
    post = session.scalar(select(ThreadsPost).where(ThreadsPost.threads_id == key))
    if post is None:
        post = ThreadsPost(threads_id=key, text=text, permalink=permalink, posted_at=posted_at, source="manual", note_product_id=note_product_id)
        session.add(post)
        session.flush()
    session.add(ThreadsInsight(post_id=post.id, **{k: int(metrics.get(k, 0)) for k in ("views", "likes", "replies", "reposts", "quotes", "shares")}))
    return post


# ---------------------------------------------------------------------------
# 分析
# ---------------------------------------------------------------------------


def _features(text: str, posted_at: datetime) -> dict:
    first_line = (text.strip().splitlines() or [""])[0]
    h = posted_at.hour
    slot = "朝（6〜10時）" if 6 <= h < 11 else "昼（11〜14時）" if h < 15 and h >= 11 else "午後（15〜18時）" if 15 <= h < 19 else "夜（19〜23時）" if 19 <= h < 24 else "深夜・早朝（0〜5時）"
    n = len(text)
    return {
        "文字数": "〜100字" if n <= 100 else "101〜250字" if n <= 250 else "251字〜",
        "時間帯": slot,
        "曜日": WEEKDAYS[posted_at.weekday()],
        "問いかけ": "あり" if re.search(r"[?？]", text) else "なし",
        "箇条書き": "あり" if re.search(r"^\s*([・\-•]|\d+[\.．)）])", text, re.M) else "なし",
        "リンク": "あり" if re.search(r"https?://", text) else "なし",
        "1行目": "短い（20字以内）" if len(first_line) <= 20 else "長い（21字以上）",
    }


def posts_frame(session: Session, since: datetime | None = None, include_sample: bool = True) -> pd.DataFrame:
    """投稿ごとの最新の反応数と特徴量。"""
    q = select(ThreadsPost).order_by(ThreadsPost.posted_at.desc())
    if since:
        q = q.where(ThreadsPost.posted_at >= since)
    if not include_sample:
        q = q.where(ThreadsPost.is_sample.is_(False))
    rows = []
    for p in session.scalars(q):
        latest = p.insights[-1] if p.insights else None
        m = {k: getattr(latest, k) if latest else 0 for k in ("views", "likes", "replies", "reposts", "quotes", "shares")}
        engagements = m["likes"] + m["replies"] + m["reposts"] + m["quotes"]
        rows.append(
            {
                "id": p.id,
                "投稿日時": p.posted_at,
                "本文": p.text,
                "URL": p.permalink,
                "取得": "あり" if latest else "未取得",
                **m,
                "反応数": engagements,
                "反応率": (engagements / m["views"]) if m["views"] else None,
                "note商品": p.note_product_id,
                "経路": {"api": "API取得", "scheduled": "予約投稿", "manual": "手入力"}.get(p.source, p.source),
                **_features(p.text, p.posted_at),
            }
        )
    return pd.DataFrame(rows)


def feature_table(df: pd.DataFrame, feature: str) -> pd.DataFrame:
    d = df[df["取得"] == "あり"]
    if d.empty:
        return pd.DataFrame()
    g = d.groupby(feature).agg(件数=("id", "count"), 平均閲覧=("views", "mean"), 平均反応率=("反応率", "mean")).reset_index()
    g["参考値"] = g["件数"].apply(lambda n: "※件数が少ない" if n < MIN_SAMPLES else "")
    return g.sort_values("平均閲覧", ascending=False)


FEATURES = ["時間帯", "文字数", "1行目", "問いかけ", "箇条書き", "曜日", "リンク"]


def analysis_facts(df: pd.DataFrame) -> dict:
    """AIに渡す「確認済みの事実」。数字はここで計算したものだけを使う。"""
    d = df[df["取得"] == "あり"]
    if d.empty:
        return {"posts_with_insights": 0}
    top = d.sort_values("views", ascending=False).head(3)
    bottom = d.sort_values("views").head(3)
    best = {}
    for f in FEATURES:
        t = feature_table(d, f)
        t = t[t["件数"] >= MIN_SAMPLES]
        if not t.empty:
            best[f] = {"最も閲覧が多い": str(t.iloc[0][f]), "平均閲覧": round(float(t.iloc[0]["平均閲覧"]), 1), "件数": int(t.iloc[0]["件数"])}
    return {
        "posts_with_insights": int(len(d)),
        "avg_views": round(float(d["views"].mean()), 1),
        "avg_engagement_rate": round(float(d["反応率"].dropna().mean()), 4) if d["反応率"].notna().any() else None,
        "top_posts": [{"text": r["本文"][:200], "views": int(r["views"]), "反応数": int(r["反応数"])} for _, r in top.iterrows()],
        "bottom_posts": [{"text": r["本文"][:200], "views": int(r["views"]), "反応数": int(r["反応数"])} for _, r in bottom.iterrows()],
        "best_features": best,
        "note": "特徴ごとの差は相関であり、原因とは限らない。" + ("投稿数が少ないため参考値。" if len(d) < 10 else ""),
    }


def follower_series(session: Session, days: int = 30) -> pd.DataFrame:
    since = date.today() - timedelta(days=days)
    rows = session.execute(
        select(AccountMetric.metric_date, AccountMetric.followers).where(AccountMetric.platform == "threads", AccountMetric.metric_date >= since).order_by(AccountMetric.metric_date)
    ).all()
    return pd.DataFrame(rows, columns=["日付", "フォロワー数"]).set_index("日付") if rows else pd.DataFrame()


# ---------------------------------------------------------------------------
# note 販売への導線（ファネル）
# ---------------------------------------------------------------------------

MANUAL_FUNNEL_CHECKS = [
    ("profile_link", "Threads のプロフィールに note（商品ページ）へのリンクを載せている"),
    ("pinned_post", "固定投稿でこの商品を紹介している"),
    ("free_part_cta", "note 無料部分の最後に、有料部分の内容と購入の案内を書いている"),
    ("real_voice_only", "購入者の声・実績は実際のものだけを載せている"),
]


@dataclass
class FunnelRow:
    product_id: int
    title: str
    price_yen: int
    status: str
    posts_7d: int
    views_30d: int
    sales_30d: int
    revenue_30d: int
    checks: list[tuple[str, str, bool, bool]]  # key, label, ok, 自動判定か

    @property
    def score(self) -> int:
        return round(100 * sum(1 for c in self.checks if c[2]) / len(self.checks)) if self.checks else 0

    @property
    def sales_per_10k_views(self) -> float | None:
        return self.sales_30d / self.views_30d * 10000 if self.views_30d else None


def funnel_rows(session: Session, now: datetime | None = None) -> list[FunnelRow]:
    now = now or datetime.now()
    rows = []
    for p in session.scalars(select(NoteProduct).where(NoteProduct.status != "停止").order_by(NoteProduct.id)):
        posts = session.scalars(select(ThreadsPost).where(ThreadsPost.note_product_id == p.id, ThreadsPost.posted_at >= now - timedelta(days=30))).all()
        posts_7d = sum(1 for x in posts if x.posted_at >= now - timedelta(days=7))
        views = sum((x.insights[-1].views if x.insights else 0) for x in posts)
        # 売上は商品名で照合（note の売上CSVの商品名と一致するもの）
        sales = session.execute(
            select(func.count(SalesRecord.id), func.coalesce(func.sum(SalesRecord.revenue_yen), 0)).where(
                SalesRecord.source == "note", SalesRecord.item_name == p.title, SalesRecord.order_date >= (now - timedelta(days=30)).date()
            )
        ).one()
        manual = json.loads(get_setting(session, f"funnel:{p.id}", "{}") or "{}")
        checks = [
            ("public_url", "note の公開URLが記録されている（販売中）", bool(p.public_url), True),
            ("price", "価格が設定されている", p.price_yen > 0, True),
            ("cta", "販売導線・CTA（行動の呼びかけ）が設定されている", bool(p.cta.strip()), True),
            ("posts", "直近7日に、この商品に紐付いた Threads 投稿が3本以上ある", posts_7d >= 3, True),
            *[(k, label, bool(manual.get(k)), False) for k, label in MANUAL_FUNNEL_CHECKS],
        ]
        rows.append(FunnelRow(p.id, p.title, p.price_yen, p.status, posts_7d, views, int(sales[0]), int(sales[1]), checks))
    return rows


def set_funnel_check(session: Session, product_id: int, key: str, value: bool) -> None:
    data = json.loads(get_setting(session, f"funnel:{product_id}", "{}") or "{}")
    data[key] = value
    set_setting(session, f"funnel:{product_id}", json.dumps(data))


def views_vs_sales(session: Session, days: int = 30) -> pd.DataFrame:
    """日別の Threads 閲覧数（その日に投稿した分）と note 販売件数。"""
    start = date.today() - timedelta(days=days - 1)
    idx = pd.date_range(start, date.today(), freq="D")
    df = pd.DataFrame(0, index=idx, columns=["Threads閲覧数", "note販売件数"])
    for p in session.scalars(select(ThreadsPost).where(ThreadsPost.posted_at >= datetime.combine(start, datetime.min.time()))):
        if p.insights:
            df.loc[pd.Timestamp(p.posted_at.date()), "Threads閲覧数"] += p.insights[-1].views
    for d, n in session.execute(
        select(SalesRecord.order_date, func.count(SalesRecord.id)).where(SalesRecord.source == "note", SalesRecord.order_date >= start).group_by(SalesRecord.order_date)
    ):
        df.loc[pd.Timestamp(d), "note販売件数"] = int(n)
    df.index.name = "日付"
    return df
