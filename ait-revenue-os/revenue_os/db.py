"""データベース接続とマイグレーション。

マイグレーションは「番号付きの変更手順」を順番に1回だけ適用する仕組み。
適用済みの番号は schema_migrations テーブルに記録する。
既存DBに変更を加える前には、data/backups/ に自動でバックアップを取る。
"""

from __future__ import annotations

import shutil
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

from sqlalchemy import Engine, create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker

from .config import get_settings
from .models import Base

# ---------------------------------------------------------------------------
# マイグレーション定義（追加するときは末尾に番号を増やして足す。既存の手順は変更しない）
# ---------------------------------------------------------------------------


def _m001_initial(conn) -> None:
    Base.metadata.create_all(conn)


def _m002_threads(conn) -> None:
    from .models import AccountMetric, AppSetting, ScheduledPost, ThreadsInsight, ThreadsPost

    Base.metadata.create_all(conn, tables=[t.__table__ for t in (ScheduledPost, ThreadsPost, ThreadsInsight, AccountMetric, AppSetting)])


def _m003_acquisition(conn) -> None:
    from .models import ChannelKPI, Review, SearchCheck, SearchKeyword

    Base.metadata.create_all(conn, tables=[t.__table__ for t in (ChannelKPI, Review, SearchKeyword, SearchCheck)])


def _m004_note(conn) -> None:
    from .models import NoteArticle

    Base.metadata.create_all(conn, tables=[NoteArticle.__table__])


MIGRATIONS: list[tuple[int, str, Callable]] = [
    (1, "初期テーブルの作成", _m001_initial),
    (2, "Threads（予約投稿・分析）・運用設定", _m002_threads),
    (3, "集客ハブ（チャネル別KPI・口コミ・検索対策）", _m003_acquisition),
    (4, "note 記事の取り込み（公式RSS）", _m004_note),
]


def _enable_sqlite_fk(engine: Engine) -> None:
    @event.listens_for(engine, "connect")
    def _on_connect(dbapi_conn, _):  # pragma: no cover - 接続ごとの設定
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()


def make_engine(db_path: Path | str | None = None) -> Engine:
    if db_path is None:
        db_path = get_settings().db_path
    if str(db_path) == ":memory:":
        engine = create_engine("sqlite://", future=True)
    else:
        path = Path(db_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        engine = create_engine(f"sqlite:///{path}", future=True)
    _enable_sqlite_fk(engine)
    return engine


def applied_versions(engine: Engine) -> set[int]:
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE IF NOT EXISTS schema_migrations ("
                "version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)"
            )
        )
        return {row[0] for row in conn.execute(text("SELECT version FROM schema_migrations"))}


def migrate(engine: Engine) -> list[int]:
    """未適用のマイグレーションを順番に適用し、適用した番号を返す。何度呼んでも安全。"""
    done = applied_versions(engine)
    pending = [m for m in MIGRATIONS if m[0] not in done]
    if not pending:
        return []
    db_file = engine.url.database
    if done and db_file and Path(db_file).exists():
        backup_dir = Path(db_file).parent / "backups"
        backup_dir.mkdir(exist_ok=True)
        shutil.copy2(db_file, backup_dir / f"{Path(db_file).stem}-{datetime.now():%Y%m%d-%H%M%S}.db")
    applied = []
    for version, name, fn in pending:
        with engine.begin() as conn:
            fn(conn)
            conn.execute(
                text("INSERT INTO schema_migrations (version, name, applied_at) VALUES (:v, :n, :t)"),
                {"v": version, "n": name, "t": datetime.now().isoformat(timespec="seconds")},
            )
        applied.append(version)
    return applied


_engine: Engine | None = None
_SessionLocal: sessionmaker[Session] | None = None


def init_db(db_path: Path | str | None = None) -> Engine:
    """アプリ起動時に1回呼ぶ。DBの作成とマイグレーションを行う。"""
    global _engine, _SessionLocal
    _engine = make_engine(db_path)
    migrate(_engine)
    _SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False, future=True)
    return _engine


@contextmanager
def session_scope() -> Iterator[Session]:
    """成功したら確定、例外なら取り消す。"""
    if _SessionLocal is None:
        init_db()
    assert _SessionLocal is not None
    session = _SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
