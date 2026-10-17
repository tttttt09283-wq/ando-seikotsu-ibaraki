from datetime import date

import pytest

from revenue_os.csv_import import ImportError_, import_sales, normalize_rows, parse_date, parse_yen, read_csv_bytes
from revenue_os.models import SalesRecord

NOTE_MAP = {"order_date": "購入日時", "item_name": "コンテンツ名", "external_id": "注文番号", "gross_yen": "販売価格", "fee_yen": "手数料", "revenue_yen": "受取金額"}
RAKUTEN_MAP = {"order_date": "注文日", "item_name": "商品名", "external_id": "成果ID", "gross_yen": "購入金額", "revenue_yen": "成果報酬"}


@pytest.mark.parametrize(
    "raw,expected",
    [("1,980", 1980), ("¥1,980", 1980), ("￥1,980", 1980), ("1,980円", 1980), ("１，９８０", 1980), ("△100", -100), ("▲100", -100), ("(100)", -100), ("-100", -100), ("¥-100", -100), ("1980.0", 1980), ("", None), ("-", None)],
)
def test_parse_yen(raw, expected):
    assert parse_yen(raw) == expected


@pytest.mark.parametrize("raw", ["12.5", "abc", "1,98a"])
def test_parse_yen_rejects_invalid(raw):
    with pytest.raises(ValueError):
        parse_yen(raw)


def test_parse_date_formats():
    for s in ["2026/10/01", "2026-10-01", "2026/10/01 21:14", "2026年10月01日", "20261001"]:
        assert parse_date(s) == date(2026, 10, 1)


def test_reads_shift_jis_and_bom():
    text = "購入日時,販売価格\n2026/10/01,\"1,280\"\n"
    for enc in ("cp932", "utf-8-sig", "utf-8"):
        df = read_csv_bytes(text.encode(enc))
        assert list(df.columns) == ["購入日時", "販売価格"]
        assert df.iloc[0]["販売価格"] == "1,280"


def test_note_revenue_computed_when_missing():
    df = read_csv_bytes("日付,価格,手数料\n2026/10/01,\"1,000\",150\n".encode())
    p = normalize_rows(df, "note", {"order_date": "日付", "gross_yen": "価格", "fee_yen": "手数料"})
    assert p.rows[0]["revenue_yen"] == 850


def test_rakuten_requires_commission_column():
    df = read_csv_bytes("注文日,購入金額\n2026/10/01,1000\n".encode())
    p = normalize_rows(df, "rakuten", {"order_date": "注文日", "gross_yen": "購入金額"})
    assert not p.rows and p.errors


def test_missing_required_mapping():
    df = read_csv_bytes("a,b\n1,2\n".encode())
    with pytest.raises(ImportError_):
        normalize_rows(df, "note", {"gross_yen": "b"})


def test_import_dedupes_same_file_and_rows(session):
    data = "購入日時,コンテンツ名,注文番号,販売価格,手数料,受取金額\n2026/10/01,A,N1,¥780,¥117,¥663\n2026/10/02,A,N2,780円,117円,663円\n".encode()
    r1 = import_sales(session, "note", "a.csv", data, NOTE_MAP)
    assert (r1.imported, r1.duplicated, r1.same_file_before) == (2, 0, False)
    r2 = import_sales(session, "note", "a.csv", data, NOTE_MAP)
    assert (r2.imported, r2.duplicated, r2.same_file_before) == (0, 2, True)
    # 別ファイルに同じ注文が含まれていても二重にならない
    data3 = "購入日時,コンテンツ名,注文番号,販売価格,手数料,受取金額\n2026/10/02,A,N2,780,117,663\n2026/10/03,A,N3,780,117,663\n".encode()
    r3 = import_sales(session, "note", "b.csv", data3, NOTE_MAP)
    assert (r3.imported, r3.duplicated) == (1, 1)
    assert session.query(SalesRecord).count() == 3


def test_rows_without_id_dedupe_by_content(session):
    m = {"order_date": "日付", "gross_yen": "金額", "revenue_yen": "報酬"}
    data = "日付,金額,報酬\n2026/10/01,1000,10\n".encode()
    assert import_sales(session, "rakuten", "x.csv", data, m).imported == 1
    assert import_sales(session, "rakuten", "y.csv", data, m).imported == 0


def test_same_id_in_note_and_rakuten_are_separate(session):
    import_sales(session, "note", "n.csv", "購入日時,コンテンツ名,注文番号,販売価格,手数料,受取金額\n2026/10/01,A,X1,100,10,90\n".encode(), NOTE_MAP)
    r = import_sales(session, "rakuten", "r.csv", "注文日,商品名,成果ID,購入金額,成果報酬\n2026/10/01,B,X1,1000,10\n".encode(), RAKUTEN_MAP)
    assert r.imported == 1


def test_row_errors_reported_not_imported(session):
    data = "購入日時,コンテンツ名,注文番号,販売価格,手数料,受取金額\nbad-date,A,E1,100,10,90\n2026/10/01,A,E2,100,10,90\n".encode()
    r = import_sales(session, "note", "e.csv", data, NOTE_MAP)
    assert r.imported == 1 and len(r.errors) == 1 and r.errors[0].row_number == 2
