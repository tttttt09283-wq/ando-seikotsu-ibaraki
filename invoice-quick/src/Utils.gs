/**
 * Utils.gs
 * 日付・通貨フォーマット、ファイル名サニタイズ、エラー生成などの汎用関数。
 *
 * 前半（純粋関数）は Google のサービスに依存しないため、tests/ から Node.js で読み込めます。
 * 後半（シート装飾ヘルパー）は SpreadsheetApp を使うため GAS 上でのみ動作します。
 */

const IQ_USER_ERROR = 'IQUserError';

/* =========================================================
 * エラー
 * ======================================================= */

/**
 * 利用者向けエラーを作成する。
 * 技術的な例外と区別し、message をそのまま案内文として表示する。
 * @param {string} message 日本語の案内文
 * @param {{sheet: string, cell: string}=} focus 修正してほしいセル
 * @return {Error}
 */
function userError(message, focus) {
  const err = new Error(message);
  err.name = IQ_USER_ERROR;
  if (focus) err.focus = focus;
  return err;
}

function isUserError(err) {
  return !!err && err.name === IQ_USER_ERROR;
}

/* =========================================================
 * 文字列・数値
 * ======================================================= */

function isDateValue(value) {
  return Object.prototype.toString.call(value) === '[object Date]';
}

/** 全角英数記号・全角スペースを半角に変換する（ID・番号・数値の正規化用） */
function toHalfWidth(value) {
  return String(value == null ? '' : value)
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, ' ')
    .replace(/[−‐‒–—]/g, '-');
}

/**
 * セルの値を安全な文字列にする。
 * 改行は \n に統一し、差し込み記号「{{ }}」は全角に置き換えて誤動作を防ぐ。
 */
function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/\r\n?/g, '\n')
    .replace(/\{\{/g, '｛｛')
    .replace(/\}\}/g, '｝｝')
    .trim();
}

/** ID や書類番号の比較用キー（全角→半角・空白除去・大文字化） */
function normalizeKey(value) {
  return toHalfWidth(normalizeText(value)).replace(/\s+/g, '').toUpperCase();
}

/**
 * セルの値を数値に変換する。
 * 空欄は null、数値として解釈できない値は NaN を返す。
 * 「1,500」「１５００」「¥1,500」「1500円」なども受け付ける。
 */
function toNumberOrNaN(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return isFinite(value) ? value : NaN;
  if (typeof value === 'boolean' || isDateValue(value)) return NaN;
  const s = toHalfWidth(value).replace(/[,\s¥￥\\円]/g, '');
  if (s === '') return null;
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  return Number(s);
}

/** 3桁カンマ区切り（小数は最大4桁、末尾の0は省略） */
function formatNumber(value) {
  const n = Number(value) || 0;
  const negative = n < 0;
  const rounded = Math.round(Math.abs(n) * 10000) / 10000;
  const parts = String(rounded).split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (negative ? '-' : '') + intPart + (parts[1] ? '.' + parts[1] : '');
}

/** 通貨表記（例：¥12,345） */
function formatYen(value) {
  const n = Number(value) || 0;
  return (n < 0 ? '-¥' : '¥') + formatNumber(Math.abs(n));
}

function pad2(n) {
  return ('0' + n).slice(-2);
}

/* =========================================================
 * 日付（タイムゾーンのずれを避けるため {y, m, d} の「日付パーツ」で扱う）
 * ======================================================= */

function makeValidParts_(y, m, d) {
  if (!(y >= 1900 && y <= 2999)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return { y: y, m: m, d: d };
}

/**
 * セルの値（Date / 文字列）を日付パーツに変換する。解釈できなければ null。
 * @param {*} value
 * @param {string=} tz スプレッドシートのタイムゾーン（Date の場合に使用）
 */
function dateToParts(value, tz) {
  if (value === null || value === undefined || value === '') return null;
  if (isDateValue(value)) {
    if (isNaN(value.getTime())) return null;
    if (typeof Utilities !== 'undefined' && tz) {
      const s = Utilities.formatDate(value, tz, 'yyyy-MM-dd').split('-');
      return makeValidParts_(Number(s[0]), Number(s[1]), Number(s[2]));
    }
    return makeValidParts_(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  const s = toHalfWidth(value).trim();
  const m = s.match(/^(\d{4})\s*[\/\-.年]\s*(\d{1,2})\s*[\/\-.月]\s*(\d{1,2})\s*日?$/);
  if (!m) return null;
  return makeValidParts_(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** 比較用の数値（例：20261017） */
function partsToNumber(p) {
  return p.y * 10000 + p.m * 100 + p.d;
}

function addDaysToParts(p, days) {
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/** monthOffset か月後の月末（0=当月末, 1=翌月末） */
function endOfMonthParts(p, monthOffset) {
  const dt = new Date(Date.UTC(p.y, p.m - 1 + monthOffset + 1, 0));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/** 「初期設定」の支払期限ルールから期限日を計算する */
function computeDueDate(issueParts, term) {
  const t = toHalfWidth(term || '').trim();
  if (t === '当月末') return endOfMonthParts(issueParts, 0);
  if (t === '翌々月末') return endOfMonthParts(issueParts, 2);
  const m = t.match(/^(\d{1,3})日後$/);
  if (m) return addDaysToParts(issueParts, Number(m[1]));
  return endOfMonthParts(issueParts, 1); // 既定：翌月末
}

function formatPartsJa(p) {
  return p ? p.y + '年' + p.m + '月' + p.d + '日' : '';
}

function formatPartsSlash(p) {
  return p ? p.y + '/' + pad2(p.m) + '/' + pad2(p.d) : '';
}

function formatPartsCompact(p) {
  return p ? String(p.y) + pad2(p.m) + pad2(p.d) : '';
}

/* =========================================================
 * ファイル名・HTML・Drive ID
 * ======================================================= */

/**
 * ファイル名に使えない文字・制御文字を「_」に置き換え、長さを制限する。
 * @param {string} value
 * @param {number=} maxLength 最大文字数（既定 60）
 */
function sanitizeFileName(value, maxLength) {
  const max = maxLength || 60;
  let s = String(value == null ? '' : value)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\\\/:*?"<>|\u0000-\u001F\u007F]/g, '_')
    .replace(/[\s　]+/g, ' ')
    .trim()
    .replace(/^[.\s]+/, '')
    .replace(/[.\s]+$/, '');
  const chars = Array.from(s);
  if (chars.length > max) s = chars.slice(0, max).join('').trim();
  return s || '無題';
}

/** 例：請求書_20261017_株式会社サンプル_INV-202610-001.pdf */
function buildPdfFileName(docLabel, issueParts, customerName, number) {
  return [
    sanitizeFileName(docLabel, 10),
    formatPartsCompact(issueParts),
    sanitizeFileName(customerName, 40),
    sanitizeFileName(number, 40),
  ].join('_') + '.pdf';
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** フォルダ/ファイルの URL や ID 文字列から Drive ID を取り出す */
function extractDriveId(value) {
  const s = toHalfWidth(normalizeText(value)).trim();
  if (!s) return '';
  const m = s.match(/\/folders\/([-\w]{10,})/) || s.match(/\/d\/([-\w]{10,})/) || s.match(/[?&]id=([-\w]{10,})/);
  if (m) return m[1];
  return s;
}

/** "C5" → {row: 5, col: 3} */
function a1ToRowCol(a1) {
  const m = String(a1).match(/^([A-Z]+)(\d+)$/);
  if (!m) throw new Error('INVALID_A1');
  let col = 0;
  for (let i = 0; i < m[1].length; i++) col = col * 26 + (m[1].charCodeAt(i) - 64);
  return { row: Number(m[2]), col: col };
}

/* =========================================================
 * GAS 専用ヘルパー（ここから下は SpreadsheetApp を使用）
 * ======================================================= */

function getTimeZone_() {
  try {
    return SpreadsheetApp.getActive().getSpreadsheetTimeZone() || 'Asia/Tokyo';
  } catch (e) {
    return 'Asia/Tokyo';
  }
}

function todayParts_() {
  return dateToParts(new Date(), getTimeZone_());
}

function getRequiredSheet_(name) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sheet) {
    throw userError('シート「' + name + '」が見つかりません。\nメニュー「Invoice Quick」→「⚙️ 初期セットアップ」を実行してください。\n（シート名を変更した場合は元の名前に戻してください）');
  }
  return sheet;
}

/** エラー箇所のセルを選択状態にする */
function focusCell_(focus) {
  if (!focus || !focus.sheet || !focus.cell) return;
  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName(focus.sheet);
    if (sheet) sheet.getRange(focus.cell).activate();
  } catch (e) {
    // 選択できなくても処理は続行する
  }
}

/** 見出しセル（濃紺・白文字・太字） */
function styleHeader_(range) {
  return range
    .setBackground(IQ.COLORS.HEADER)
    .setFontColor(IQ.COLORS.HEADER_TEXT)
    .setFontWeight('bold')
    .setVerticalAlignment('middle');
}

/** セクション見出し（淡い紺） */
function styleSection_(range) {
  return range
    .setBackground(IQ.COLORS.SECTION)
    .setFontColor(IQ.COLORS.HEADER)
    .setFontWeight('bold')
    .setVerticalAlignment('middle');
}

/** ラベルを書き込み、必須項目なら赤いアスタリスクを付ける */
function setLabel_(range, text, required, onDark) {
  if (!required) {
    range.setValue(text);
    return range;
  }
  const full = text + ' *';
  const red = SpreadsheetApp.newTextStyle()
    .setForegroundColor(onDark ? IQ.COLORS.REQUIRED_ON_DARK : IQ.COLORS.REQUIRED)
    .setBold(true)
    .build();
  const rich = SpreadsheetApp.newRichTextValue()
    .setText(full)
    .setTextStyle(full.length - 1, full.length, red)
    .build();
  range.setRichTextValue(rich);
  return range;
}

if (typeof module !== 'undefined' && module.exports) {
  Object.assign(module.exports, {
    userError, isUserError, isDateValue, toHalfWidth, normalizeText, normalizeKey, toNumberOrNaN,
    formatNumber, formatYen, dateToParts, partsToNumber, addDaysToParts, endOfMonthParts,
    computeDueDate, formatPartsJa, formatPartsSlash, formatPartsCompact, sanitizeFileName,
    buildPdfFileName, escapeHtml, extractDriveId, a1ToRowCol,
  });
}
