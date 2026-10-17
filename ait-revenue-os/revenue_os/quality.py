"""品質管理AI（ルール版）と、公開前チェックリスト。

ルールチェックはAPIキーがなくても常に動く。結果は「指摘」であり、最終判断は人間が行う。
法令・規約の最新内容は、ここでは断定せず「公式情報を人間が確認する」チェック項目として扱う。
"""

from __future__ import annotations

import re
from dataclasses import dataclass

AFFILIATE_PATTERN = re.compile(r"(hb\.afl\.rakuten\.co\.jp|rakuten\.co\.jp|a\.r10\.to|r10\.to)", re.I)
# 英単語の一部（product 等）やURL内の文字列に反応しないよう、前後が英字でない「PR」だけを表記とみなす
DISCLOSURE_PATTERN = re.compile(r"((?<![A-Za-z])PR(?![A-Za-z])|広告|プロモーション|アフィリエイト)")
PRICE_PATTERN = re.compile(r"([¥￥]\s?[\d,]+|[\d,]+\s?円)")
PRICE_DATE_PATTERN = re.compile(r"(時点|確認日|現在の価格|最新の価格)")
EXPERIENCE_PATTERN = re.compile(r"(使ってみた|実際に使|愛用|試してみ|リピート|効果があった|効果を実感|口コミ|レビュー|★)")
ABSOLUTE_PATTERN = re.compile(r"(絶対|必ず|確実に|100%|１００％|誰でも|痩せ|治る|治り|完治|稼げる|儲かる|最安)")
DM_PATTERN = re.compile(r"(DM|ＤＭ|ダイレクトメッセージ)")

SEVERITY_ERROR = "要修正"
SEVERITY_WARN = "要確認"


@dataclass(frozen=True)
class Finding:
    severity: str
    message: str


def x_weighted_length(text: str) -> int:
    """X の文字数の目安（全角などは2、半角英数は1として数える）。"""
    return sum(1 if ord(ch) < 0x1100 else 2 for ch in text)


def has_affiliate_link(text: str) -> bool:
    return bool(AFFILIATE_PATTERN.search(text or ""))


def check_content(channel: str, title: str, body: str, linked_rakuten: bool = False) -> list[Finding]:
    text = f"{title}\n{body}"
    findings: list[Finding] = []
    affiliate = linked_rakuten or has_affiliate_link(text)

    if affiliate and not DISCLOSURE_PATTERN.search(text):
        findings.append(Finding(SEVERITY_ERROR, "アフィリエイトを含むのに広告表記（PR・広告など）が見当たりません。冒頭など分かりやすい位置に表記してください。"))
    if affiliate and DM_PATTERN.search(text):
        findings.append(Finding(SEVERITY_ERROR, "DMへの誘導とアフィリエイトが同じ投稿にあります。DMでのリンク送付は行わない運用です。"))
    if affiliate and PRICE_PATTERN.search(text) and not PRICE_DATE_PATTERN.search(text):
        findings.append(Finding(SEVERITY_WARN, "価格の記載があります。「◯月◯日時点」など確認日時を併記し、最新価格は販売ページで確認するよう案内してください。"))
    for m in sorted(set(EXPERIENCE_PATTERN.findall(text))):
        findings.append(Finding(SEVERITY_WARN, f"「{m}」：使用体験・レビューの表現です。実際の体験に基づくか確認してください（架空の体験は掲載不可）。"))
    for m in sorted(set(ABSOLUTE_PATTERN.findall(text))):
        findings.append(Finding(SEVERITY_WARN, f"「{m}」：断定・誇大と受け取られる可能性がある表現です。根拠を確認するか言い換えてください。"))
    if channel == "x" and x_weighted_length(body) > 280:
        findings.append(Finding(SEVERITY_WARN, f"X の文字数の目安（全角140字）を超えています（換算 {x_weighted_length(body)}／280）。"))
    if channel == "threads" and len(body) > 500:
        findings.append(Finding(SEVERITY_WARN, f"Threads の文字数の目安（500字）を超えています（{len(body)}字）。"))
    if not body.strip():
        findings.append(Finding(SEVERITY_ERROR, "本文が空です。"))
    return findings


def has_blocking(findings: list[Finding]) -> bool:
    return any(f.severity == SEVERITY_ERROR for f in findings)


# ---------------------------------------------------------------------------
# 公開前チェックリスト（承認時に人間がすべて確認する）
# ---------------------------------------------------------------------------

BASE_CHECKLIST = [
    ("facts", "事実・数字は出典で確認した（AIの仮説を事実として書いていない）"),
    ("no_fake", "架空のレビュー・使用体験・売上・効果を書いていない"),
    ("no_exaggeration", "断定・誇大な表現（必ず・絶対・誰でも 等）を使っていない、または根拠がある"),
    ("platform_rules", "投稿先（note / X / Threads）の利用規約・ガイドラインに反していない"),
    ("no_spam", "同じ内容の大量投稿・無差別なメンション・DM送付をしない"),
]

AFFILIATE_CHECKLIST = [
    ("pr_label", "広告であることが一目で分かる表記（【PR】など）を冒頭付近に入れた（景品表示法のステルスマーケティング規制）"),
    ("rakuten_rules", "楽天アフィリエイトの最新の規約・ガイドライン（リンク掲載ルール）を公式サイトで確認した"),
    ("price_date", "価格・在庫・ポイント等には確認日時を併記し、変動する旨を書いた"),
    ("link_place", "リンクの掲載場所が規約上許可されている場所である（DM・メールでの送付はしない）"),
]

NOTE_SALES_CHECKLIST = [
    ("note_rules", "note の有料記事・販売に関するルールを確認した"),
    ("content_match", "有料部分の内容が、無料部分・紹介文の説明と一致している"),
]


def checklist_for(channel: str, body: str, linked_rakuten: bool, linked_note_product: bool) -> list[tuple[str, str]]:
    items = list(BASE_CHECKLIST)
    if linked_rakuten or has_affiliate_link(body):
        items += AFFILIATE_CHECKLIST
    if linked_note_product or channel == "note":
        items += NOTE_SALES_CHECKLIST
    return items
