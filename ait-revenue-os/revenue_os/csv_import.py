"""売上CSVの取り込み。

note と楽天では CSV の列名・形式が異なり、仕様も変わり得るため、列名を推測で決め打ちしない。
画面で「どの列が何か」を利用者が対応付け（列マッピング）し、その対応で取り込む。
よく使う対応はプリセットとして保存できる（初期プリセットは同梱のサンプルCSV用）。

重複防止:
- 行ごとに「注文ID」または「日付・商品名・金額・行内容」から重複キーを作り、同じキーの行は取り込まない
- 同じファイルを再度取り込んだ場合も、既存行はすべてスキップされる
"""

from __future__ import annotations

import hashlib
import io
import json
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import ImportBatch, SalesRecord

# 取り込み先の項目
TARGET_FIELDS = {
    "order_date": ("日付", True),
    "item_name": ("商品名", False),
    "external_id": ("注文ID・成果ID", False),
    "quantity": ("数量", False),
    "gross_yen": ("売上金額（円）", False),
    "fee_yen": ("手数料（円）", False),
    "revenue_yen": ("受取額・報酬額（円）", False),
    "status": ("状態（確定・未確定など）", False),
}

# 同梱サンプルCSV（sample_data/）用のプリセット。実際のCSVの列名は各サービスの最新画面で確認すること。
PRESETS: dict[str, dict[str, dict[str, str]]] = {
    "note": {
        "サンプル形式（同梱CSV）": {
            "order_date": "購入日時",
            "item_name": "コンテンツ名",
            "external_id": "注文番号",
            "gross_yen": "販売価格",
            "fee_yen": "手数料",
            "revenue_yen": "受取金額",
        }
    },
    "rakuten": {
        "サンプル形式（同梱CSV）": {
            "order_date": "注文日",
            "item_name": "商品名",
            "external_id": "成果ID",
            "quantity": "個数",
            "gross_yen": "購入金額",
            "revenue_yen": "成果報酬",
            "status": "ステータス",
        }
    },
}


class ImportError_(Exception):
    """利用者に表示できる日本語のエラー。"""


def read_csv_bytes(data: bytes) -> pd.DataFrame:
    """文字コードを自動判定して読み込む（UTF-8 / BOM付きUTF-8 / Shift_JIS(cp932)）。値はすべて文字列で読む。"""
    last_error: Exception | None = None
    for enc in ("utf-8-sig", "cp932"):
        try:
            df = pd.read_csv(io.BytesIO(data), encoding=enc, dtype=str, keep_default_na=False)
            df.columns = [str(c).strip() for c in df.columns]
            return df
        except (UnicodeDecodeError, pd.errors.ParserError) as e:
            last_error = e
    raise ImportError_(f"CSVを読み込めませんでした（文字コードまたは形式が不明です）：{last_error}")


_NEG_MARKS = ("△", "▲", "-", "−", "ー")


def parse_yen(value: object) -> int | None:
    """円の金額を整数に変換する。

    対応: "1,980" "¥1,980" "1,980円" "１９８０" "△100" "▲100" "(100)" "-100" "1980.0"
    空欄・"-" は None。小数（1円未満）は四捨五入せずエラーにする（円建てで端数は想定外のため）。
    """
    if value is None:
        return None
    s = unicodedata.normalize("NFKC", str(value)).strip()
    if s in ("", "-", "−", "ー", "nan", "None"):
        return None
    negative = False
    if s.startswith("(") and s.endswith(")"):
        negative, s = True, s[1:-1].strip()
    if s.startswith(_NEG_MARKS):
        negative, s = True, s[1:].strip()
    s = s.replace("¥", "").replace("￥", "").replace("円", "").replace(",", "").replace(" ", "")
    if s.startswith(_NEG_MARKS):
        negative, s = True, s[1:]
    if not re.fullmatch(r"\d+(\.\d+)?", s):
        raise ValueError(f"金額として読めません：{value!r}")
    if "." in s:
        whole, frac = s.split(".", 1)
        if int(frac) != 0:
            raise ValueError(f"1円未満の端数があります：{value!r}")
        s = whole
    n = int(s)
    return -n if negative else n


_DATE_FORMATS = ("%Y-%m-%d", "%Y/%m/%d", "%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y/%m/%d %H:%M", "%Y年%m月%d日", "%Y%m%d")


def parse_date(value: object) -> date:
    s = unicodedata.normalize("NFKC", str(value or "")).strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(s).date()
    except ValueError as e:
        raise ValueError(f"日付として読めません：{value!r}") from e


def file_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _dedupe_key(source: str, row: dict, raw: dict) -> str:
    if row.get("external_id"):
        basis = f"id|{row['external_id']}"
    else:
        # 注文IDがない場合は、行の内容全体から作る（同一内容の行は1件とみなす）
        basis = "row|" + json.dumps(raw, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(f"{source}|{basis}".encode()).hexdigest()


@dataclass
class RowError:
    row_number: int
    message: str


@dataclass
class ImportPreview:
    rows: list[dict] = field(default_factory=list)
    errors: list[RowError] = field(default_factory=list)


def normalize_rows(df: pd.DataFrame, source: str, mapping: dict[str, str]) -> ImportPreview:
    """マッピングに従って各行を取り込み用の形に変換する（DBにはまだ書かない）。"""
    if source not in ("note", "rakuten"):
        raise ImportError_("取り込み先は note か 楽天 を選んでください。")
    mapping = {k: v for k, v in mapping.items() if v}
    for key, (label, required) in TARGET_FIELDS.items():
        if required and key not in mapping:
            raise ImportError_(f"「{label}」の列を選んでください。")
    missing_cols = [c for c in mapping.values() if c not in df.columns]
    if missing_cols:
        raise ImportError_(f"CSVに次の列がありません：{', '.join(missing_cols)}")
    if not any(k in mapping for k in ("gross_yen", "revenue_yen")):
        raise ImportError_("「売上金額」または「受取額・報酬額」のどちらかの列を選んでください。")

    preview = ImportPreview()
    for i, raw in enumerate(df.to_dict(orient="records"), start=2):  # 1行目は見出し
        try:
            gross = parse_yen(raw.get(mapping.get("gross_yen", ""), None)) if "gross_yen" in mapping else None
            fee = parse_yen(raw.get(mapping.get("fee_yen", ""), None)) if "fee_yen" in mapping else None
            revenue = parse_yen(raw.get(mapping.get("revenue_yen", ""), None)) if "revenue_yen" in mapping else None
            qty_raw = raw.get(mapping["quantity"]) if "quantity" in mapping else None
            qty = int(unicodedata.normalize("NFKC", str(qty_raw)).replace(",", "")) if qty_raw not in (None, "") else 1
            if revenue is None:
                # 受取額の列がない場合：note は 売上−手数料、楽天は報酬額が必要
                if source == "rakuten":
                    raise ValueError("楽天は「成果報酬（受取額）」の列が必要です（購入金額は受取額ではありません）。")
                revenue = (gross or 0) - abs(fee or 0)
            row = {
                "order_date": parse_date(raw.get(mapping["order_date"])),
                "item_name": str(raw.get(mapping.get("item_name", ""), "") or "").strip(),
                "external_id": str(raw.get(mapping.get("external_id", ""), "") or "").strip(),
                "quantity": qty,
                "gross_yen": gross or 0,
                "fee_yen": abs(fee or 0),
                "revenue_yen": revenue,
                "status": str(raw.get(mapping.get("status", ""), "") or "").strip(),
            }
            row["dedupe_key"] = _dedupe_key(source, row, raw)
            preview.rows.append(row)
        except (ValueError, TypeError) as e:
            preview.errors.append(RowError(i, str(e)))
    return preview


@dataclass
class ImportResult:
    batch_id: int
    imported: int
    duplicated: int
    errors: list[RowError]
    same_file_before: bool


def import_sales(session: Session, source: str, filename: str, data: bytes, mapping: dict[str, str], is_sample: bool = False) -> ImportResult:
    df = read_csv_bytes(data)
    preview = normalize_rows(df, source, mapping)
    fhash = file_hash(data)
    same_file_before = session.scalar(select(ImportBatch.id).where(ImportBatch.file_hash == fhash, ImportBatch.source == source).limit(1)) is not None

    existing = set(session.scalars(select(SalesRecord.dedupe_key).where(SalesRecord.source == source)))
    batch = ImportBatch(source=source, filename=filename, file_hash=fhash, mapping_json=json.dumps(mapping, ensure_ascii=False), rows_total=len(df))
    session.add(batch)
    session.flush()

    imported = duplicated = 0
    for row in preview.rows:
        if row["dedupe_key"] in existing:
            duplicated += 1
            continue
        existing.add(row["dedupe_key"])
        session.add(SalesRecord(source=source, import_batch_id=batch.id, is_sample=is_sample, **row))
        imported += 1
    batch.rows_imported = imported
    batch.rows_duplicated = duplicated
    batch.rows_error = len(preview.errors)
    return ImportResult(batch.id, imported, duplicated, preview.errors, same_file_before)


def guess_mapping(columns: list[str], source: str) -> dict[str, str]:
    """プリセットの列名と一致するものだけを初期選択する（推測で別の列に当てはめない）。"""
    result: dict[str, str] = {}
    for preset in PRESETS.get(source, {}).values():
        for key, col in preset.items():
            if col in columns and key not in result:
                result[key] = col
    return result
