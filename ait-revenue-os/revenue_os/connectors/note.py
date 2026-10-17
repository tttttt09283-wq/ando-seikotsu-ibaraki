"""note の連携（公式RSS）。

note には一般公開された開発者向けAPIがないため、note が公式に提供している RSS（https://note.com/ユーザー名/rss）だけを使う。
非公式API・ページの読み取り（スクレイピング）は行わない。
取れるもの：記事のタイトル・URL・公開日時・概要。閲覧数・スキ・売上は RSS に含まれないため、
売上はCSV取り込み、閲覧数・スキは集客ハブで手入力する。
"""

from __future__ import annotations

import re
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from email.utils import parsedate_to_datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import NoteArticle, NoteProduct
from ..threads_analytics import get_setting, set_setting

USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{1,50}$")
Fetcher = Callable[[str], bytes]


class NoteError(Exception):
    pass


def rss_url(username: str) -> str:
    if not USERNAME_RE.match(username or ""):
        raise NoteError("note のユーザー名が正しくありません（note.com/〇〇 の 〇〇 部分。英数字と _ のみ）。")
    return f"https://note.com/{username}/rss"


def _default_fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "AIT-Revenue-OS/0.1 (RSS reader)"})
    try:
        with urllib.request.urlopen(req, timeout=30) as res:  # noqa: S310 - note公式RSSのみ
            return res.read()
    except urllib.error.HTTPError as e:
        raise NoteError("RSS が見つかりませんでした。ユーザー名を確認してください。" if e.code == 404 else f"note に接続できませんでした（{e.code}）") from e
    except urllib.error.URLError as e:
        raise NoteError(f"note に接続できませんでした：{e.reason}") from e


@dataclass
class RssItem:
    title: str
    url: str
    published_at: datetime
    summary: str


def parse_rss(data: bytes) -> list[RssItem]:
    try:
        root = ET.fromstring(data)
    except ET.ParseError as e:
        raise NoteError("RSS の形式を読み取れませんでした。") from e
    items = []
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip()
        link = (it.findtext("link") or "").strip()
        if not title or not link.startswith("https://"):
            continue
        pub = it.findtext("pubDate")
        try:
            published = parsedate_to_datetime(pub).astimezone().replace(tzinfo=None) if pub else datetime.now()
        except (TypeError, ValueError):
            published = datetime.now()
        summary = re.sub(r"<[^>]+>", "", it.findtext("description") or "").strip()[:500]
        items.append(RssItem(title, link.split("?")[0], published, summary))
    return items


def _norm(s: str) -> str:
    return re.sub(r"[\s　「」『』【】（）()・:：!！?？]", "", s).lower()


@dataclass
class NoteSyncResult:
    total: int = 0
    new: list[NoteArticle] = field(default_factory=list)
    linked: int = 0


def sync_note(session: Session, username: str, fetch: Fetcher = _default_fetch) -> NoteSyncResult:
    items = parse_rss(fetch(rss_url(username)))
    first_time = not get_setting(session, "note_last_sync")
    products = session.scalars(select(NoteProduct)).all()
    result = NoteSyncResult(total=len(items))
    for item in items:
        art = session.scalar(select(NoteArticle).where(NoteArticle.url == item.url))
        if art is None:
            art = NoteArticle(url=item.url, title=item.title, summary=item.summary, published_at=item.published_at, promo_draft_created=first_time)
            session.add(art)
            session.flush()
            if not first_time:  # 初回は既存記事として取り込むだけ（告知の下書きを大量に作らない）
                result.new.append(art)
        else:
            art.title, art.summary = item.title, item.summary
        if art.note_product_id is None:
            for p in products:
                if p.public_url and p.public_url.split("?")[0] == item.url:
                    art.note_product_id = p.id
                elif not p.public_url and _norm(p.title) and _norm(p.title) == _norm(item.title):
                    art.note_product_id = p.id
                    p.public_url = item.url  # 商品名と記事タイトルが一致 → 公開URLを自動記録
                if art.note_product_id:
                    result.linked += 1
                    break
    set_setting(session, "note_last_sync", datetime.now().isoformat(timespec="seconds"))
    return result


def create_promo_drafts(session: Session, articles: list[NoteArticle], limit: int = 3) -> int:
    """新しい記事ごとに、Threads の紹介投稿の下書きを作る（投稿はしない。承認・予約が必要）。"""
    from ..ai.generators import threads_improvement
    from ..threads_analytics import analysis_facts, posts_frame
    from ..workflow import create_content

    made = 0
    facts = None
    for art in articles[:limit]:
        if art.promo_draft_created:
            continue
        facts = facts or analysis_facts(posts_frame(session))
        res = threads_improvement(session, facts, {"title": art.title, "concept": art.summary[:300], "url": art.url}, count=1)
        posts = res.data.get("next_posts", [])
        if not posts:
            continue
        body = posts[0]["body"].replace("（noteのリンク）", art.url)
        if art.url not in body:
            body = f"{body}\n\n{art.url}"
        if len(body) > 500:  # Threads の上限に収める（URLは必ず残す）
            body = body.replace(art.url, "").strip()[: 500 - len(art.url) - 1] + "\n" + art.url
        create_content(session, "threads", "", body, actor="マーケティングAI", ai_generated=True, note_product_id=art.note_product_id)
        art.promo_draft_created = True
        made += 1
    return made
