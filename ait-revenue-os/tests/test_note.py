from datetime import date

import pytest

from revenue_os.acquisition import metric_values
from revenue_os.connectors.note import NoteError, parse_rss, rss_url, sync_note
from revenue_os.connectors.sync import sync_all
from revenue_os.models import Content, NoteArticle, NoteProduct
from revenue_os.threads_analytics import set_setting


def rss(*items):
    body = "".join(
        f"<item><title>{t}</title><link>{u}?utm=rss</link><pubDate>{d}</pubDate><description><![CDATA[<p>{t}の概要</p>]]></description></item>" for t, u, d in items
    )
    return f'<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>{body}</channel></rss>'.encode()


A1 = ("はじめての確定申告 AI活用チェックリスト", "https://note.com/ait/n/n111", "Fri, 16 Oct 2026 12:00:00 +0900")
A2 = ("新しい記事", "https://note.com/ait/n/n222", "Sat, 17 Oct 2026 08:00:00 +0900")


def test_rss_url_validation():
    assert rss_url("ait_company") == "https://note.com/ait_company/rss"
    for bad in ["", "a/b", "../x", "x" * 60]:
        with pytest.raises(NoteError):
            rss_url(bad)


def test_parse_rss_strips_query_and_html():
    items = parse_rss(rss(A1))
    assert items[0].url == "https://note.com/ait/n/n111" and items[0].summary.startswith("はじめての")
    with pytest.raises(NoteError):
        parse_rss(b"not xml")


def test_sync_links_product_and_promos_only_new(session):
    p = NoteProduct(title="はじめての確定申告 AI活用チェックリスト", status="制作中")
    session.add(p)
    session.flush()
    set_setting(session, "note_username", "ait")
    r = sync_all(session, today=date(2026, 10, 17), note_fetch=lambda url: rss(A1))
    assert r[0].ok and "紐付け 1件" in r[0].message
    session.refresh(p)
    assert p.public_url == "https://note.com/ait/n/n111"  # 公開URLを自動記録
    assert session.query(Content).count() == 0  # 初回は告知下書きを作らない
    r = sync_all(session, today=date(2026, 10, 17), note_fetch=lambda url: rss(A2, A1))
    assert "新着 1件" in r[0].message and "Threads 下書き" in r[0].message
    drafts = session.query(Content).filter_by(channel="threads").all()
    assert len(drafts) == 1 and "https://note.com/ait/n/n222" in drafts[0].body and len(drafts[0].body) <= 500
    assert session.query(NoteArticle).count() == 2
    assert {m.label: m.value for m in metric_values(session, "note", date(2026, 10, 17))}["公開記事（7日）"] == 2


def test_sync_error_reported(session):
    def boom(url):
        raise NoteError("RSS が見つかりませんでした。")

    set_setting(session, "note_username", "ait")
    r = sync_all(session, note_fetch=boom)
    assert not r[0].ok
