/**
 * Customer.gs
 * 「顧客マスタ」シートの作成・検索と、宛名の組み立て。
 * 入力シートでは顧客IDを選ぶだけで、顧客名〜メールが数式で自動表示されます。
 */

const IQ_CUSTOMER_HEADERS = Object.freeze(['顧客ID', '顧客名', '担当者', '郵便番号', '住所', 'メール', '備考', '敬称']);
const IQ_CUSTOMER_REQUIRED = Object.freeze([true, true, false, false, false, false, false, false]);
const IQ_CUSTOMER_MAX_ROWS = 1000;
const IQ_CUSTOMER_SAMPLES = Object.freeze([
  ['C001', '株式会社サンプル商事', '佐藤 花子', '100-0001', '東京都千代田区千代田1-1 サンプルビル5F', 'sato@example.com', '（サンプル）不要になったら行ごと削除してください', '御中'],
  ['C002', '田中 一郎', '', '530-0001', '大阪府大阪市北区梅田1-1-1', 'tanaka@example.com', '（サンプル）個人のお客様の例', '様'],
]);

function ensureCustomerSheet_(ss) {
  return ss.getSheetByName(IQ.SHEETS.CUSTOMERS) || buildCustomerSheet_(ss);
}

function buildCustomerSheet_(ss) {
  const sheet = ss.insertSheet(IQ.SHEETS.CUSTOMERS);
  const cols = IQ_CUSTOMER_HEADERS.length;
  const header = sheet.getRange(1, 1, 1, cols);
  styleHeader_(header).setHorizontalAlignment('center');
  IQ_CUSTOMER_HEADERS.forEach((h, i) => setLabel_(sheet.getRange(1, i + 1), h, IQ_CUSTOMER_REQUIRED[i], true));
  sheet.setRowHeight(1, 30);

  const body = sheet.getRange(2, 1, IQ_CUSTOMER_MAX_ROWS - 1, cols);
  body.setBackground(IQ.COLORS.INPUT).setVerticalAlignment('middle');
  sheet.getRange(2, 1, IQ_CUSTOMER_MAX_ROWS - 1, 1).setNumberFormat('@'); // ID の先頭0を保持
  sheet.getRange(2, 4, IQ_CUSTOMER_MAX_ROWS - 1, 1).setNumberFormat('@'); // 郵便番号
  sheet.getRange(2, 8, IQ_CUSTOMER_MAX_ROWS - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(['御中', '様'], true)
      .setAllowInvalid(true)
      .setHelpText('法人・団体は「御中」、個人は「様」。担当者を入力した場合は「担当者名 様」と表示されます。')
      .build());

  writeCustomerSamples_(sheet);

  [90, 220, 130, 90, 300, 200, 240, 70].forEach((w, i) => sheet.setColumnWidth(i + 1, w));
  sheet.setFrozenRows(1);
  sheet.getRange('J1').setValue('← 1行に1社。顧客IDは「C001」のように重複しない番号を付けてください。').setFontColor(IQ.COLORS.HINT);
  return sheet;
}

/** サンプル顧客を書き込む（2行目から。既存の顧客データは消去） */
function writeCustomerSamples_(sheet) {
  const cols = IQ_CUSTOMER_HEADERS.length;
  const last = sheet.getLastRow();
  if (last >= 2) sheet.getRange(2, 1, last - 1, cols).clearContent();
  sheet.getRange(2, 1, IQ_CUSTOMER_SAMPLES.length, cols).setValues(IQ_CUSTOMER_SAMPLES.map((r) => r.slice()));
}

/** 顧客マスタを全件読み込む */
function getCustomers_() {
  const sheet = getRequiredSheet_(IQ.SHEETS.CUSTOMERS);
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const values = sheet.getRange(2, 1, last - 1, IQ_CUSTOMER_HEADERS.length).getValues();
  const list = [];
  values.forEach((r, i) => {
    if (normalizeText(r[0]) === '' && normalizeText(r[1]) === '') return;
    list.push({
      row: i + 2,
      id: normalizeText(r[0]),
      name: normalizeText(r[1]),
      contact: normalizeText(r[2]).replace(/\s*様$/, ''),
      postal: normalizeText(r[3]).replace(/^〒\s*/, ''),
      address: normalizeText(r[4]),
      email: toHalfWidth(normalizeText(r[5])).trim(),
      note: normalizeText(r[6]),
      honorific: normalizeText(r[7]),
    });
  });
  return list;
}

/**
 * 顧客IDで検索する。
 * @return {{customer: Object|null, count: number, rows: number[]}}
 */
function getCustomerById(id) {
  const key = normalizeKey(id);
  if (!key) return { customer: null, count: 0, rows: [] };
  const matches = getCustomers_().filter((c) => normalizeKey(c.id) === key);
  return { customer: matches[0] || null, count: matches.length, rows: matches.map((c) => c.row) };
}

/**
 * 書類・メールに使う宛名を組み立てる。
 *  担当者あり：「株式会社〇〇」＋「佐藤 花子 様」
 *  担当者なし：「株式会社〇〇 御中」（敬称列の値。空欄なら御中）
 */
function buildRecipient(customer) {
  const name = customer.name || '';
  const contact = (customer.contact || '').replace(/\s*様$/, '');
  const honorific = (customer.honorific || '').trim() || '御中';
  if (contact) {
    return { line1: name, line2: contact + ' 様', salutation: name + '\n' + contact + ' 様' };
  }
  return { line1: name + ' ' + honorific, line2: '', salutation: name + ' ' + honorific };
}

/** 入力シートの顧客ID欄に設定するプルダウン */
function buildCustomerIdValidation_(ss) {
  const sheet = ss.getSheetByName(IQ.SHEETS.CUSTOMERS);
  return SpreadsheetApp.newDataValidation()
    .requireValueInRange(sheet.getRange(2, 1, IQ_CUSTOMER_MAX_ROWS - 1, 1), true)
    .setAllowInvalid(false)
    .setHelpText('「顧客マスタ」に登録した顧客IDを▼から選んでください。')
    .build();
}

if (typeof module !== 'undefined' && module.exports) {
  Object.assign(module.exports, { buildRecipient });
}
