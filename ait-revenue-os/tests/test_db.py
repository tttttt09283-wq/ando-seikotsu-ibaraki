from sqlalchemy import inspect

from revenue_os import db


def test_migrate_is_idempotent_and_creates_tables(tmp_path):
    engine = db.make_engine(tmp_path / "m.db")
    assert db.migrate(engine) == [1, 2, 3]
    assert db.migrate(engine) == []
    tables = set(inspect(engine).get_table_names())
    for t in ["sales_records", "contents", "approval_events", "rakuten_items", "note_products", "research_themes", "ai_usage", "daily_reports"]:
        assert t in tables


def test_backup_taken_before_new_migration(tmp_path, monkeypatch):
    path = tmp_path / "b.db"
    engine = db.make_engine(path)
    db.migrate(engine)
    monkeypatch.setattr(db, "MIGRATIONS", [*db.MIGRATIONS, (99, "テスト", lambda conn: None)])
    assert db.migrate(engine) == [99]
    assert list((tmp_path / "backups").glob("b-*.db"))
