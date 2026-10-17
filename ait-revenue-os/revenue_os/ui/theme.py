"""デザイン：ダークネイビー × 発光するブルーの枠 × ゴールドの見出し。"""

from __future__ import annotations

import html

import streamlit as st

CSS = """
<style>
:root {
  --ait-navy: #060B1F;
  --ait-navy-2: #0E1838;
  --ait-blue: #2F7BFF;
  --ait-cyan: #5FD3FF;
  --ait-gold: #F5B83D;
  --ait-gold-2: #FFE08A;
  --ait-text: #E8EEFF;
  --ait-muted: #9AA8D6;
}
.stApp {
  background:
    radial-gradient(1200px 500px at 70% -10%, rgba(47,123,255,.22), transparent 60%),
    radial-gradient(800px 400px at -10% 30%, rgba(95,211,255,.10), transparent 60%),
    var(--ait-navy);
}
[data-testid="stSidebar"] {
  background: linear-gradient(180deg, #0A1230 0%, #060B1F 100%);
  border-right: 1px solid rgba(47,123,255,.25);
}
h1 {
  background: linear-gradient(180deg, var(--ait-gold-2), var(--ait-gold) 60%, #D98E1F);
  -webkit-background-clip: text; background-clip: text; color: transparent !important;
  font-weight: 900 !important; letter-spacing: .02em;
}
h2, h3 { color: var(--ait-text) !important; }
/* 枠付きコンテナ・指標を発光カードに */
[data-testid="stVerticalBlockBorderWrapper"]:has(> div > [data-testid="stVerticalBlock"]) {
  border-color: rgba(47,123,255,.45) !important;
  background: linear-gradient(160deg, rgba(20,36,90,.55), rgba(8,14,40,.75));
  box-shadow: 0 0 0 1px rgba(95,211,255,.06) inset, 0 0 18px rgba(47,123,255,.18);
  border-radius: 16px !important;
}
[data-testid="stMetric"] {
  background: linear-gradient(160deg, rgba(20,36,90,.6), rgba(8,14,40,.8));
  border: 1px solid rgba(47,123,255,.45);
  border-radius: 14px; padding: 12px 14px;
  box-shadow: 0 0 16px rgba(47,123,255,.16);
}
[data-testid="stMetricValue"] { color: var(--ait-gold-2) !important; font-weight: 800; }
[data-testid="stMetricLabel"] p { color: var(--ait-muted) !important; }
.stButton > button[kind="primary"], .stFormSubmitButton > button[kind="primary"] {
  background: linear-gradient(90deg, #2F7BFF, #4F5BFF);
  border: 0; color: #fff; font-weight: 700;
  box-shadow: 0 0 14px rgba(47,123,255,.45);
}
.stTabs [data-baseweb="tab-list"] { gap: 6px; }
.stTabs [aria-selected="true"] { color: var(--ait-gold) !important; }

/* ヒーロー */
.ait-hero {
  position: relative; overflow: hidden;
  border-radius: 20px; padding: 26px 28px 22px;
  border: 1px solid rgba(95,211,255,.35);
  background:
    radial-gradient(600px 200px at 85% 0%, rgba(95,211,255,.25), transparent 70%),
    linear-gradient(135deg, #0B1640 0%, #08102E 55%, #0B1A4A 100%);
  box-shadow: 0 0 30px rgba(47,123,255,.25), inset 0 0 40px rgba(47,123,255,.12);
  margin-bottom: 18px;
}
.ait-hero .brand { color: #fff; font-weight: 800; letter-spacing: .08em; font-size: .95rem; opacity: .9; }
.ait-hero .headline {
  font-size: clamp(1.8rem, 4vw, 2.9rem); font-weight: 900; line-height: 1.15; margin: 6px 0 8px;
  background: linear-gradient(180deg, #FFF3C4, #FFD25E 45%, #F0A325);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  text-shadow: 0 0 24px rgba(245,184,61,.25);
}
.ait-hero .sub { color: #fff; font-weight: 700; font-size: 1.02rem; }
.ait-hero .sub b { color: var(--ait-gold); }
.ait-hero .script { position: absolute; right: 22px; top: 18px; color: var(--ait-cyan); font-style: italic; font-family: Georgia, serif; opacity: .85; }

/* チャネルカード */
.ait-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; margin: 8px 0 18px; }
.ait-card {
  border-radius: 16px; padding: 14px 16px; min-height: 132px;
  border: 1px solid rgba(47,123,255,.55);
  background: linear-gradient(160deg, rgba(22,40,100,.65), rgba(8,14,40,.85));
  box-shadow: 0 0 18px rgba(47,123,255,.22), inset 0 0 22px rgba(47,123,255,.08);
}
.ait-card.warn { border-color: rgba(245,184,61,.75); box-shadow: 0 0 18px rgba(245,184,61,.22); }
.ait-card .top { display: flex; align-items: center; gap: 10px; }
.ait-card .icon { font-size: 1.6rem; }
.ait-card .name { color: #fff; font-weight: 800; font-size: 1.02rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ait-card .mode { margin-left: auto; white-space: nowrap; flex-shrink: 0; font-size: .7rem; padding: 2px 8px; border-radius: 999px; border: 1px solid rgba(95,211,255,.5); color: var(--ait-cyan); }
.ait-card .mode.manual { border-color: rgba(154,168,214,.5); color: var(--ait-muted); }
.ait-card .kpi { margin-top: 10px; color: var(--ait-gold-2); font-size: 1.5rem; font-weight: 900; }
.ait-card .kpi small { color: var(--ait-muted); font-size: .75rem; font-weight: 600; margin-left: 4px; }
.ait-card .meta { color: var(--ait-muted); font-size: .78rem; margin-top: 4px; }
.ait-card .delta.up { color: #4ADE80; } .ait-card .delta.down { color: #F87171; }

/* 機能タイル */
.ait-features { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 6px 0 4px; }
.ait-feature {
  text-align: center; padding: 16px 10px; border-radius: 16px;
  border: 1px solid rgba(95,211,255,.45);
  background: radial-gradient(120px 80px at 50% 0%, rgba(95,211,255,.18), transparent 70%), rgba(10,18,50,.85);
  box-shadow: 0 0 14px rgba(47,123,255,.2);
}
.ait-feature .ic { font-size: 1.8rem; }
.ait-feature .lb { color: #fff; font-weight: 800; margin-top: 6px; border-bottom: 2px solid var(--ait-gold); display: inline-block; padding-bottom: 2px; }
.ait-feature .ds { color: var(--ait-muted); font-size: .75rem; margin-top: 6px; }

/* 分析の3ステップ */
.ait-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.ait-step { border-radius: 14px; padding: 12px 14px; border: 1px solid rgba(47,123,255,.45); background: rgba(10,18,50,.8); }
.ait-step .t { color: var(--ait-gold); font-weight: 800; }
.ait-step ul { margin: 6px 0 0 1.1em; padding: 0; color: var(--ait-text); font-size: .88rem; }
@media (max-width: 760px) { .ait-steps { grid-template-columns: 1fr; } .ait-hero .script { display: none; } }
</style>
"""


def apply_theme() -> None:
    st.markdown(CSS, unsafe_allow_html=True)


def esc(x: object) -> str:
    return html.escape(str(x))


def hero(headline: str, sub_html: str, brand: str = "A.I.T Revenue OS", script: str = "Grow with A.I.T") -> None:
    st.markdown(
        f'<div class="ait-hero"><div class="script">{esc(script)}</div><div class="brand">{esc(brand)}</div>'
        f'<div class="headline">{esc(headline)}</div><div class="sub">{sub_html}</div></div>',
        unsafe_allow_html=True,
    )


def feature_tiles(items: list[tuple[str, str, str]]) -> None:
    """(アイコン, 名前, 説明) のタイルを並べる。"""
    cells = "".join(f'<div class="ait-feature"><div class="ic">{esc(i)}</div><div class="lb">{esc(n)}</div><div class="ds">{esc(d)}</div></div>' for i, n, d in items)
    st.markdown(f'<div class="ait-features">{cells}</div>', unsafe_allow_html=True)
