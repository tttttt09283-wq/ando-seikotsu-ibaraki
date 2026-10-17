/**
 * Validator.gs
 * 入力値・必須項目の検証。
 * エラーは { sheet, cell, message } の配列で返し、修正すべきセルを日本語で案内します。
 * （Google のサービスに依存しないため、tests/ から検証できます）
 */

const IQ_REGISTRATION_NUMBER_PATTERN = /^T\d{13}$/;
const IQ_MAX_TEXT = Object.freeze({ number: 40, name: 100, note: 100, subject: 100, notes: 1000 });

function makeError_(sheet, cell, message) {
  return { sheet: sheet, cell: cell, message: message };
}

/** 登録番号を正規化（全角→半角、ハイフン・空白除去、大文字化） */
function normalizeRegistrationNumber(value) {
  return toHalfWidth(normalizeText(value)).replace(/[\s\-]/g, '').toUpperCase();
}

/**
 * 「初期設定」の検証。
 * @param {Object} settings getSettings() の戻り値
 * @param {{type:string, templateKey:string}} def 書類種別の定義
 * @param {function(string):{sheet:string, cell:string}} focusOf 設定キー → セル位置
 */
function validateSettings(settings, def, focusOf) {
  const errors = [];
  const add = (key, msg) => {
    const f = focusOf(key);
    errors.push(makeError_(f.sheet, f.cell, msg));
  };
  if (!normalizeText(settings.issuerName)) {
    add('issuerName', '「初期設定」の発行者名（屋号・氏名）を入力してください。');
  }
  if (!normalizeRoundingMode(settings.roundingMode)) {
    add('roundingMode', '「初期設定」の消費税の端数処理を「切り捨て・四捨五入・切り上げ」から選んでください。');
  }
  const reg = normalizeRegistrationNumber(settings.registrationNumber);
  if (reg && !IQ_REGISTRATION_NUMBER_PATTERN.test(reg)) {
    add('registrationNumber', '登録番号は「T＋13桁の数字」で入力してください（例：T1234567890123）。未登録の場合は空欄にしてください。');
  }
  if (!normalizeText(settings[def.templateKey])) {
    add(def.templateKey, def.label + 'テンプレートが未作成です。メニュー「Invoice Quick」→「⚙️ 初期セットアップ」を実行してください。');
  }
  return errors;
}

/**
 * 明細行の検証と変換。
 * @param {Array<{row:number, name:*, qty:*, price:*, rate:*, note:*}>} rows
 * @param {string} sheetName
 * @return {{items: Array<Object>, errors: Array<Object>}}
 */
function validateItemRows(rows, sheetName) {
  const errors = [];
  const items = [];
  const L = CALC_LIMITS;
  rows.forEach((r) => {
    const name = normalizeText(r.name);
    const note = normalizeText(r.note);
    const qtyRaw = r.qty;
    const priceRaw = r.price;
    const isBlank = (v) => v === null || v === undefined || String(v).trim() === '';
    if (!name && isBlank(qtyRaw) && isBlank(priceRaw) && !note) return; // 空行
    const prefix = '明細' + (r.row - IQ_INPUT_LAYOUT.itemStartRow + 1) + '行目：';
    const before = errors.length;

    if (!name) errors.push(makeError_(sheetName, 'B' + r.row, prefix + '品名を入力してください。'));
    else if (Array.from(name).length > IQ_MAX_TEXT.name) errors.push(makeError_(sheetName, 'B' + r.row, prefix + '品名は' + IQ_MAX_TEXT.name + '文字以内にしてください。'));

    const qty = toNumberOrNaN(qtyRaw);
    if (qty === null) errors.push(makeError_(sheetName, 'C' + r.row, prefix + '数量を入力してください。'));
    else if (isNaN(qty)) errors.push(makeError_(sheetName, 'C' + r.row, prefix + '数量は数字で入力してください（例：1、2.5）。'));
    else if (qty === 0) errors.push(makeError_(sheetName, 'C' + r.row, prefix + '数量に0は指定できません。不要な行は削除してください。'));
    else if (Math.abs(qty) > L.MAX_QUANTITY) errors.push(makeError_(sheetName, 'C' + r.row, prefix + '数量が大きすぎます（' + formatNumber(L.MAX_QUANTITY) + 'まで）。'));
    else if (!hasAtMostDecimals(qty, L.MAX_DECIMALS)) errors.push(makeError_(sheetName, 'C' + r.row, prefix + '数量の小数は' + L.MAX_DECIMALS + '桁までです。'));

    const price = toNumberOrNaN(priceRaw);
    if (price === null) errors.push(makeError_(sheetName, 'D' + r.row, prefix + '単価（税抜）を入力してください。値引きはマイナスで入力できます。'));
    else if (isNaN(price)) errors.push(makeError_(sheetName, 'D' + r.row, prefix + '単価は数字で入力してください（例：50000）。'));
    else if (Math.abs(price) > L.MAX_UNIT_PRICE) errors.push(makeError_(sheetName, 'D' + r.row, prefix + '単価が大きすぎます（' + formatNumber(L.MAX_UNIT_PRICE) + '円まで）。'));
    else if (!hasAtMostDecimals(price, L.MAX_DECIMALS)) errors.push(makeError_(sheetName, 'D' + r.row, prefix + '単価の小数は' + L.MAX_DECIMALS + '桁までです。'));

    let rate = normalizeTaxRate(r.rate);
    if (rate === null) rate = CALC_DEFAULT_TAX_RATE;
    if (isNaN(rate)) errors.push(makeError_(sheetName, 'E' + r.row, prefix + '税率は 10・8・0 のいずれかを選んでください。'));

    if (Array.from(note).length > IQ_MAX_TEXT.note) errors.push(makeError_(sheetName, 'G' + r.row, prefix + '備考は' + IQ_MAX_TEXT.note + '文字以内にしてください。'));

    if (errors.length === before) {
      items.push({ row: r.row, name: name, quantity: qty, unitPrice: price, taxRate: rate, note: note });
    }
  });
  return { items: items, errors: errors };
}

/**
 * 入力シートの値を検証・変換する。
 * @param {Object} raw readDocumentInput_() の戻り値
 * @param {{type:string, label:string, sheetName:string, numberLabel:string, dueLabel:string}} def
 * @param {string=} tz タイムゾーン
 * @return {{parsed: Object, errors: Array<Object>}}
 */
function validateDocumentInput(raw, def, tz) {
  const L = IQ_INPUT_LAYOUT;
  const sheet = def.sheetName;
  const errors = [];
  const add = (cell, msg) => errors.push(makeError_(sheet, cell, msg));
  const parsed = {};

  parsed.number = normalizeText(raw.number).replace(/\s+/g, ' ');
  if (!parsed.number) add(L.number, def.numberLabel + 'を入力してください。メニュー「新しい' + def.label + 'を準備」で自動採番できます。');
  else if (Array.from(parsed.number).length > IQ_MAX_TEXT.number) add(L.number, def.numberLabel + 'は' + IQ_MAX_TEXT.number + '文字以内にしてください。');

  parsed.issueDate = dateToParts(raw.issueDate, tz);
  if (!parsed.issueDate) add(L.issueDate, '発行日を日付で入力してください（例：2026/10/17）。');

  parsed.dueDate = dateToParts(raw.dueDate, tz);
  if (!parsed.dueDate) add(L.dueDate, def.dueLabel + 'を日付で入力してください（例：2026/11/30）。');
  else if (parsed.issueDate && partsToNumber(parsed.dueDate) < partsToNumber(parsed.issueDate)) {
    add(L.dueDate, def.dueLabel + 'が発行日より前になっています。日付を確認してください。');
  }

  parsed.customerId = normalizeText(raw.customerId);
  if (!parsed.customerId) add(L.customerId, '顧客IDを▼から選んでください。新しい取引先は先に「顧客マスタ」へ登録します。');

  parsed.subject = normalizeText(raw.subject).replace(/\n+/g, ' ');
  if (Array.from(parsed.subject).length > IQ_MAX_TEXT.subject) add(L.subject, '件名は' + IQ_MAX_TEXT.subject + '文字以内にしてください。');

  parsed.notes = normalizeText(raw.notes);
  if (Array.from(parsed.notes).length > IQ_MAX_TEXT.notes) add(L.notes, '備考は' + IQ_MAX_TEXT.notes + '文字以内にしてください。');

  if (def.type === 'invoice') {
    const opt = normalizeText(raw.option);
    parsed.withholding = opt === 'する' || opt === 'あり' || opt === 'TRUE' || raw.option === true;
  } else {
    parsed.terms = normalizeText(raw.option);
    if (Array.from(parsed.terms).length > IQ_MAX_TEXT.notes) add(L.option, '見積条件は' + IQ_MAX_TEXT.notes + '文字以内にしてください。');
  }

  const itemResult = validateItemRows(raw.items || [], sheet);
  parsed.items = itemResult.items;
  itemResult.errors.forEach((e) => errors.push(e));
  if (itemResult.items.length === 0 && itemResult.errors.length === 0) {
    add('B' + L.itemStartRow, '明細を1行以上入力してください（品名・数量・単価）。');
  }
  return { parsed: parsed, errors: errors };
}

/**
 * 顧客検索結果の検証。
 * @param {{customer:Object|null, count:number, rows:number[]}} found
 * @param {string} customerId
 * @param {{sheetName:string}} def
 */
function validateCustomerLookup(found, customerId, def) {
  const errors = [];
  if (!customerId) return errors;
  if (!found.customer) {
    errors.push(makeError_(def.sheetName, IQ_INPUT_LAYOUT.customerId,
      '顧客ID「' + customerId + '」が「顧客マスタ」に見つかりません。▼から選び直すか、顧客マスタに登録してください。'));
  } else if (found.count > 1) {
    errors.push(makeError_(IQ.SHEETS.CUSTOMERS, 'A' + found.rows[1],
      '顧客ID「' + customerId + '」が顧客マスタに' + found.count + '件あります（' + found.rows.join('・') + '行目）。IDが重複しないよう修正してください。'));
  } else if (!found.customer.name) {
    errors.push(makeError_(IQ.SHEETS.CUSTOMERS, 'B' + found.customer.row,
      '顧客マスタ' + found.customer.row + '行目の顧客名が空欄です。'));
  }
  return errors;
}

/** 計算結果の検証（マイナス・0円・上限超過） */
function validateCalculation(calc, def) {
  const errors = [];
  const cell = 'F' + (IQ_INPUT_LAYOUT.summaryStartRow + 7);
  if (calc.total < 0) errors.push(makeError_(def.sheetName, cell, '合計金額がマイナスになっています。値引き行の金額を確認してください。'));
  else if (calc.total === 0) errors.push(makeError_(def.sheetName, cell, '合計金額が0円です。数量・単価を確認してください。'));
  else if (calc.total > CALC_LIMITS.MAX_TOTAL) errors.push(makeError_(def.sheetName, cell, '合計金額が上限（1兆円）を超えています。'));
  return errors;
}

/** エラー一覧を表示用の文章にする */
function formatErrorsForDisplay(errors, maxLines) {
  const max = maxLines || 8;
  const lines = errors.slice(0, max).map((e) => '・' + e.message + '\n　（' + e.sheet + ' シート ' + e.cell + '）');
  if (errors.length > max) lines.push('…ほか ' + (errors.length - max) + ' 件');
  return lines.join('\n');
}

if (typeof module !== 'undefined' && module.exports) {
  Object.assign(module.exports, {
    normalizeRegistrationNumber, validateSettings, validateItemRows, validateDocumentInput,
    validateCustomerLookup, validateCalculation, formatErrorsForDisplay,
  });
}
