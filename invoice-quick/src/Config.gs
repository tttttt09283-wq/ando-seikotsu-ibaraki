/**
 * Config.gs
 * アプリ全体の定数（シート名・色・セル配置）と「初期設定」シートの読み書き。
 */

const IQ = Object.freeze({
  APP_NAME: 'Invoice Quick',
  VERSION: '1.0.0',
  SHEETS: Object.freeze({
    README: 'README',
    SETTINGS: '初期設定',
    CUSTOMERS: '顧客マスタ',
    INVOICE: '請求書入力',
    ESTIMATE: '見積書入力',
    HISTORY: '発行履歴',
  }),
  COLORS: Object.freeze({
    INPUT: '#FFF8D6',          // 入力セル（淡黄色）
    AUTO: '#EEEEEE',           // 自動計算セル（淡グレー）
    HEADER: '#1F2D4D',         // 見出し（濃紺）
    HEADER_TEXT: '#FFFFFF',
    SECTION: '#E3E8F2',        // セクション見出し
    REQUIRED: '#D93025',       // 必須アスタリスク
    REQUIRED_ON_DARK: '#FF8A80',
    HINT: '#5F6368',
    BORDER: '#C9CED6',
  }),
  NAMED_RANGE_ROUNDING: 'IQ_ROUNDING',
  ROOT_FOLDER_NAME: 'Invoice Quick 発行書類',
  TEMPLATE_FOLDER_NAME: 'テンプレート',
  STATUS: Object.freeze({ ISSUED: '発行済', REISSUED: '再発行', CANCELED: '取消' }),
  LOCK_WAIT_MS: 15000,
});

/**
 * 請求書入力・見積書入力シート共通のセル配置。
 * 行・列を変更する場合はここだけを修正すれば全処理に反映されます。
 */
const IQ_INPUT_LAYOUT = Object.freeze({
  number: 'C4',
  issueDate: 'C5',
  dueDate: 'C6',        // 請求書：支払期限 / 見積書：有効期限
  customerId: 'C7',
  customerName: 'C8',   // ここから C12 までは顧客マスタから自動表示（数式）
  contact: 'C9',
  postal: 'C10',
  address: 'C11',
  email: 'C12',
  subject: 'C13',
  option: 'C14',        // 請求書：源泉徴収 / 見積書：見積条件
  notes: 'C15',
  itemHeaderRow: 17,
  itemStartRow: 18,
  maxItems: 20,         // 18〜37行
  col: Object.freeze({ no: 1, name: 2, qty: 3, price: 4, rate: 5, amount: 6, note: 7 }),
  summaryStartRow: 39,
  readRange: 'A1:G48',
});

/**
 * 「初期設定」シートの項目定義。
 * key   : 内部キー（A列・非表示）
 * fallback: 空欄のとき default を使う
 * auto  : セットアップで自動入力（灰色）
 */
const IQ_SETTING_DEFS = Object.freeze([
  { section: '発行者情報（書類の右上に表示）' },
  { key: 'issuerName', label: '発行者名（屋号・氏名）', required: true, help: '例）山田デザイン事務所 山田 太郎' },
  { key: 'issuerPostal', label: '郵便番号', format: '@', help: '例）123-4567（空欄なら表示しません）' },
  { key: 'issuerAddress', label: '住所', help: '例）東京都渋谷区〇〇1-2-3　※自宅住所を載せたくない場合は空欄でもOK' },
  { key: 'issuerTel', label: '電話番号', format: '@', help: '例）090-1234-5678（空欄なら表示しません）' },
  { key: 'issuerEmail', label: 'メールアドレス', help: '例）info@example.com' },
  { key: 'registrationNumber', label: '適格請求書発行事業者 登録番号', format: '@', help: '「T＋13桁の数字」。未登録の場合は空欄（書類に表示されません）' },
  { section: '振込先口座（請求書に表示）' },
  { key: 'bankName', label: '銀行名', help: '例）〇〇銀行' },
  { key: 'bankBranch', label: '支店名', help: '例）渋谷支店' },
  { key: 'bankType', label: '口座種別', default: '普通', fallback: true, options: ['普通', '当座', '貯蓄'] },
  { key: 'bankNumber', label: '口座番号', format: '@', help: '例）1234567（先頭の0もそのまま入力できます）' },
  { key: 'bankHolder', label: '口座名義（カナ）', help: '例）ヤマダ タロウ' },
  { section: '計算・採番ルール' },
  { key: 'roundingMode', label: '消費税の端数処理', required: true, default: '切り捨て', fallback: true, options: ['切り捨て', '四捨五入', '切り上げ'], help: '税率ごとに1回だけ端数処理します（明細金額の1円未満も同じルール）' },
  { key: 'invoicePrefix', label: '請求書番号の接頭辞', default: 'INV-', fallback: true, format: '@', help: '自動採番の例）INV-202610-001' },
  { key: 'estimatePrefix', label: '見積書番号の接頭辞', default: 'EST-', fallback: true, format: '@', help: '自動採番の例）EST-202610-001' },
  { key: 'paymentTerm', label: '支払期限の初期値', default: '翌月末', fallback: true, options: ['当月末', '翌月末', '翌々月末', '14日後', '30日後', '60日後'], help: '「新しい請求書を準備」で自動入力される期限' },
  { key: 'estimateValidDays', label: '見積有効期限（日数）', default: 30, fallback: true, help: '「新しい見積書を準備」で発行日＋この日数を自動入力' },
  { key: 'invoiceDefaultNote', label: '請求書の備考（初期値）', default: '恐れ入りますが、振込手数料は貴社にてご負担くださいますようお願い申し上げます。', help: '「新しい請求書を準備」で備考欄に自動入力されます' },
  { key: 'estimateDefaultTerms', label: '見積条件（初期値）', default: '納期：ご発注後、別途ご相談\nお支払条件：納品月末締め 翌月末払い', help: 'セル内改行は Ctrl+Enter（Mac は ⌘+Enter）' },
  { section: 'メール文面' },
  { key: 'mailSignature', label: 'メール署名', help: '空欄なら発行者情報から自動で作成します' },
  { section: '保存先・テンプレート（初期セットアップで自動設定）' },
  { key: 'folderId', label: 'PDF保存先フォルダID', format: '@', help: '空欄ならセットアップ時に自動作成。別フォルダに保存したい場合はフォルダのURLを貼り付け' },
  { key: 'invoiceTemplateId', label: '請求書テンプレートID', auto: true, format: '@', help: '自動設定。デザインを変えたい場合はこのIDのドキュメントを編集' },
  { key: 'estimateTemplateId', label: '見積書テンプレートID', auto: true, format: '@', help: '自動設定。デザインを変えたい場合はこのIDのドキュメントを編集' },
]);

const IQ_SETTINGS_FIRST_ROW = 4;

/* =========================================================
 * 読み込み
 * ======================================================= */

/** @return {{map: Object<string,*>, rows: Object<string,number>}} */
function readSettingsMap_() {
  const sheet = getRequiredSheet_(IQ.SHEETS.SETTINGS);
  const last = sheet.getLastRow();
  const map = {};
  const rows = {};
  if (last >= 1) {
    const values = sheet.getRange(1, 1, last, 3).getValues();
    values.forEach((r, i) => {
      const key = String(r[0]).trim();
      if (key && !Object.prototype.hasOwnProperty.call(map, key)) {
        map[key] = r[2];
        rows[key] = i + 1;
      }
    });
  }
  return { map: map, rows: rows };
}

/**
 * 「初期設定」シートの値をオブジェクトで返す。
 * @return {Object<string,*>}
 */
function getSettings() {
  const read = readSettingsMap_();
  const settings = {};
  IQ_SETTING_DEFS.forEach((def) => {
    if (!def.key) return;
    let v = Object.prototype.hasOwnProperty.call(read.map, def.key) ? read.map[def.key] : '';
    if (typeof v === 'string') v = v.replace(/\r\n?/g, '\n').trim();
    if ((v === '' || v === null) && def.fallback) v = def.default;
    settings[def.key] = v;
  });
  settings._rows = read.rows;
  return settings;
}

/** 設定項目のセル位置（エラー時のフォーカス用） */
function settingFocus_(key, settings) {
  const rows = (settings && settings._rows) || readSettingsMap_().rows;
  const row = rows[key];
  return row ? { sheet: IQ.SHEETS.SETTINGS, cell: 'C' + row } : { sheet: IQ.SHEETS.SETTINGS, cell: 'C' + IQ_SETTINGS_FIRST_ROW };
}

/** 設定値を書き込む（項目が無ければ末尾に追加） */
function setSetting(key, value) {
  const sheet = getRequiredSheet_(IQ.SHEETS.SETTINGS);
  const rows = readSettingsMap_().rows;
  let row = rows[key];
  if (!row) {
    const def = IQ_SETTING_DEFS.filter((d) => d.key === key)[0];
    if (!def) throw new Error('UNKNOWN_SETTING_KEY');
    row = Math.max(sheet.getLastRow() + 1, IQ_SETTINGS_FIRST_ROW);
    writeSettingRow_(sheet, row, def);
  }
  sheet.getRange(row, 3).setValue(value);
}

/* =========================================================
 * シート作成
 * ======================================================= */

/** 「初期設定」シートを作成（既存の場合は不足している項目だけを追加） */
function ensureSettingsSheet_(ss) {
  let sheet = ss.getSheetByName(IQ.SHEETS.SETTINGS);
  if (!sheet) {
    sheet = buildSettingsSheet_(ss);
    return sheet;
  }
  const rows = readSettingsMap_().rows;
  IQ_SETTING_DEFS.forEach((def) => {
    if (def.key && !rows[def.key]) writeSettingRow_(sheet, sheet.getLastRow() + 1, def);
  });
  return sheet;
}

function buildSettingsSheet_(ss) {
  const sheet = ss.insertSheet(IQ.SHEETS.SETTINGS);
  sheet.getRange('B1:D1').merge().setValue('初期設定').setFontSize(14);
  styleHeader_(sheet.getRange('A1:D1'));
  sheet.setRowHeight(1, 36);
  sheet.getRange('B2:D2').merge()
    .setValue('黄色のセルに入力してください（赤い * は必須）。灰色のセルは初期セットアップで自動入力されます。')
    .setFontColor(IQ.COLORS.HINT).setWrap(true);
  sheet.getRange('A3:D3').setValues([['キー', '項目', '設定値', '説明・入力例']]);
  styleHeader_(sheet.getRange('A3:D3'));

  let row = IQ_SETTINGS_FIRST_ROW;
  IQ_SETTING_DEFS.forEach((def) => {
    writeSettingRow_(sheet, row, def);
    row++;
  });

  sheet.setColumnWidth(1, 140);
  sheet.setColumnWidth(2, 240);
  sheet.setColumnWidth(3, 340);
  sheet.setColumnWidth(4, 420);
  sheet.hideColumns(1);
  sheet.setFrozenRows(3);
  return sheet;
}

function writeSettingRow_(sheet, row, def) {
  if (def.section) {
    sheet.getRange(row, 2, 1, 3).merge().setValue('■ ' + def.section);
    styleSection_(sheet.getRange(row, 1, 1, 4));
    return;
  }
  sheet.getRange(row, 1).setValue(def.key).setFontColor(IQ.COLORS.HINT);
  setLabel_(sheet.getRange(row, 2), def.label, def.required);
  const cell = sheet.getRange(row, 3);
  if (def.format) cell.setNumberFormat(def.format);
  if (def.default !== undefined) cell.setValue(def.default);
  cell.setBackground(def.auto ? IQ.COLORS.AUTO : IQ.COLORS.INPUT).setWrap(true).setVerticalAlignment('middle');
  if (def.options) {
    cell.setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(def.options, true)
      .setAllowInvalid(false)
      .build());
  }
  sheet.getRange(row, 4).setValue(def.help || '').setFontColor(IQ.COLORS.HINT).setWrap(true).setVerticalAlignment('middle');
  sheet.getRange(row, 2).setVerticalAlignment('middle');
  sheet.setRowHeight(row, String(def.default || '').indexOf('\n') >= 0 ? 44 : 26);
}

/** 入力シートのプレビュー数式が参照する名前付き範囲「IQ_ROUNDING」を作成・更新 */
function ensureRoundingNamedRange_(ss) {
  const sheet = ss.getSheetByName(IQ.SHEETS.SETTINGS);
  const row = readSettingsMap_().rows.roundingMode;
  if (!sheet || !row) return;
  ss.setNamedRange(IQ.NAMED_RANGE_ROUNDING, sheet.getRange(row, 3));
}
