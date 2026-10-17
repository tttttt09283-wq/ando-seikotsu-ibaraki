/**
 * Invoice.gs
 * 請求書作成のメイン処理と、請求書・見積書で共通の書類作成エンジン。
 *
 * ■ PDF 作成の流れ（runDocumentGeneration_）
 *  1. 入力チェック（初期設定・入力シート・顧客マスタ）→ 問題があれば修正セルを案内して終了
 *  2. 金額計算 → 整合性セルフチェック
 *  3. 二重発行チェック（同じ番号が発行済みなら確認）
 *  4. LockService で排他制御し、番号を再確認してから PDF 作成 → 発行履歴に記録
 *     （履歴に記録できなかった場合は PDF を削除し、成功扱いにしない）
 *  5. 完了ダイアログ（PDF リンク + 送信用メール文面）
 */

/** 書類種別ごとの定義 */
function getDocTypeDef_(type) {
  if (type === 'invoice') {
    return {
      type: 'invoice', label: '請求書', sheetName: IQ.SHEETS.INVOICE,
      numberLabel: '請求書番号', dueLabel: '支払期限',
      prefixKey: 'invoicePrefix', templateKey: 'invoiceTemplateId',
      buildPayload: buildInvoicePayload_,
    };
  }
  if (type === 'estimate') {
    return {
      type: 'estimate', label: '見積書', sheetName: IQ.SHEETS.ESTIMATE,
      numberLabel: '見積書番号', dueLabel: '有効期限',
      prefixKey: 'estimatePrefix', templateKey: 'estimateTemplateId',
      buildPayload: buildEstimatePayload_,
    };
  }
  throw new Error('UNKNOWN_DOC_TYPE');
}

/* =========================================================
 * メニューから呼ばれる関数（請求書）
 * ======================================================= */

/** メニュー：📄 請求書PDFを作成 */
function createInvoicePdf() {
  runSafely_('請求書PDFの作成', () => runDocumentGeneration_('invoice'));
}

/** メニュー：🆕 新しい請求書を準備 */
function prepareNewInvoice() {
  runSafely_('新しい請求書の準備', () => {
    if (prepareDocumentSheet_(getDocTypeDef_('invoice'), { confirm: true })) {
      SpreadsheetApp.getActive().toast('番号・発行日・支払期限を入力しました。顧客IDを▼から選び、明細を入力してください。', IQ.APP_NAME, 8);
    }
  });
}

/** メニュー：✉️ メール文面を作成（発行履歴の選択行） */
function showMailTextFromHistory() {
  runSafely_('メール文面の作成', () => {
    const rec = getSelectedOrLastHistoryRecord_();
    if (!rec) {
      throw userError('発行履歴がまだありません。先に請求書または見積書のPDFを作成してください。\n（特定の書類のメール文面を作る場合は、「発行履歴」シートでその行を選択してから実行します）');
    }
    const settings = getSettings();
    const found = getCustomerById(rec.customerId);
    const customer = found.customer || { name: rec.customerName, contact: '', honorific: '', email: '' };
    const mail = buildMailText_({
      docLabel: rec.type, number: rec.number, subject: rec.subject, customer: customer,
      amount: rec.amount, amountNote: '', deadline: rec.deadline, settings: settings,
    });
    const warnings = [];
    if (rec.status === IQ.STATUS.CANCELED) warnings.push('この書類は発行履歴で「取消」になっています。送信前に内容をご確認ください。');
    if (!found.customer) warnings.push('顧客マスタに顧客ID「' + rec.customerId + '」が見つからないため、宛名は履歴の顧客名を使用しました。');
    showResultDialog_({
      dialogTitle: 'メール文面',
      heading: rec.type + '「' + rec.number + '」の送信用メール文面',
      url: rec.url, fileName: '', mail: mail, warnings: warnings,
    });
  });
}

/* =========================================================
 * 書類作成エンジン（請求書・見積書 共通）
 * ======================================================= */

/** 入力シートの値をまとめて読み込む（getValues 1回で高速化） */
function readDocumentInput_(sheet) {
  const L = IQ_INPUT_LAYOUT;
  const values = sheet.getRange(L.readRange).getValues();
  const at = (a1) => {
    const p = a1ToRowCol(a1);
    return values[p.row - 1][p.col - 1];
  };
  const items = [];
  for (let i = 0; i < L.maxItems; i++) {
    const row = L.itemStartRow + i;
    const v = values[row - 1];
    items.push({
      row: row,
      name: v[L.col.name - 1],
      qty: v[L.col.qty - 1],
      price: v[L.col.price - 1],
      rate: v[L.col.rate - 1],
      note: v[L.col.note - 1],
    });
  }
  return {
    number: at(L.number),
    issueDate: at(L.issueDate),
    dueDate: at(L.dueDate),
    customerId: at(L.customerId),
    subject: at(L.subject),
    option: at(L.option),
    notes: at(L.notes),
    items: items,
  };
}

function showValidationErrors_(errors) {
  focusCell_(errors[0]);
  const ui = SpreadsheetApp.getUi();
  ui.alert(
    '入力内容を確認してください（' + errors.length + '件）',
    formatErrorsForDisplay(errors) + '\n\n最初の項目のセルを選択しました。修正してから、もう一度実行してください。',
    ui.ButtonSet.OK);
}

function formatIssuedAt_(value) {
  if (isDateValue(value)) return Utilities.formatDate(value, getTimeZone_(), 'yyyy/MM/dd HH:mm');
  return normalizeText(value);
}

/**
 * 書類の PDF を作成する（請求書・見積書 共通）。
 * @param {string} type 'invoice' | 'estimate'
 */
function runDocumentGeneration_(type) {
  const startedAt = Date.now();
  const def = getDocTypeDef_(type);
  const ss = SpreadsheetApp.getActive();
  const ui = SpreadsheetApp.getUi();
  const tz = getTimeZone_();
  const sheet = getRequiredSheet_(def.sheetName);
  getRequiredSheet_(IQ.SHEETS.HISTORY);
  const settings = getSettings();

  // 1) 入力チェック
  const raw = readDocumentInput_(sheet);
  const checked = validateDocumentInput(raw, def, tz);
  const parsed = checked.parsed;
  let errors = validateSettings(settings, def, (key) => settingFocus_(key, settings)).concat(checked.errors);
  let customer = null;
  if (parsed.customerId) {
    const found = getCustomerById(parsed.customerId);
    errors = errors.concat(validateCustomerLookup(found, parsed.customerId, def));
    customer = found.customer;
  }
  if (errors.length) {
    showValidationErrors_(errors);
    return;
  }

  // 2) 金額計算 + セルフチェック
  const calc = calculateDocument(parsed.items, {
    roundingMode: settings.roundingMode,
    withholding: type === 'invoice' && parsed.withholding,
  });
  if (checkCalculationIntegrity(calc).length) {
    throw userError('金額の検算で不一致が見つかったため、安全のため作成を中止しました。\n明細の数量・単価・税率を見直してから、もう一度実行してください。');
  }
  errors = validateCalculation(calc, def);
  if (errors.length) {
    showValidationErrors_(errors);
    return;
  }

  // 3) 二重発行チェック（確認ダイアログはロック取得前に表示する）
  const existing = findIssuedRecords(def.label, parsed.number);
  let status = IQ.STATUS.ISSUED;
  if (existing.length) {
    const last = existing[existing.length - 1];
    const answer = ui.alert(
      '⚠️ 同じ番号の' + def.label + 'が発行済みです',
      def.numberLabel + '「' + parsed.number + '」は既に発行されています。\n' +
      '（' + formatIssuedAt_(last.issuedAt) + '／' + last.customerName + '／発行履歴 ' + last.row + '行目）\n\n' +
      '・別の書類の場合 →「いいえ」を押し、番号を変更してください。\n' +
      '・同じ書類を修正して出し直す場合だけ →「はい」（履歴に「再発行」と記録されます）\n\n' +
      '同じ番号で再発行しますか？',
      ui.ButtonSet.YES_NO);
    if (answer !== ui.Button.YES) {
      focusCell_({ sheet: def.sheetName, cell: IQ_INPUT_LAYOUT.number });
      return;
    }
    status = IQ.STATUS.REISSUED;
  }

  // 4) 排他制御の中で PDF 作成 → 履歴記録
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(IQ.LOCK_WAIT_MS)) {
    throw userError('別の書類を作成中です。完了してから、もう一度実行してください。\n（メニューの連続クリックや、別のタブでの同時実行が原因の場合があります）');
  }
  let output = null;
  let payload = null;
  try {
    if (findIssuedRecords(def.label, parsed.number).length > existing.length) {
      throw userError(def.numberLabel + '「' + parsed.number + '」は、たった今ほかの操作で発行されました。\n「発行履歴」を確認し、必要なら番号を変更してから実行してください。',
        { sheet: def.sheetName, cell: IQ_INPUT_LAYOUT.number });
    }
    ss.toast('PDFを作成しています…（通常5〜10秒）', IQ.APP_NAME, 30);
    payload = def.buildPayload({ parsed: parsed, calc: calc, settings: settings, customer: customer });
    const folder = getOutputFolder_(settings, def, parsed.issueDate);
    const fileName = buildPdfFileName(def.label, parsed.issueDate, customer.name, parsed.number);
    output = generatePdf({
      templateId: settings[def.templateKey], templateKey: def.templateKey, label: def.label,
      folder: folder, fileName: fileName, settings: settings,
      values: payload.values, conditionalRows: payload.conditionalRows, items: payload.items,
    });
    try {
      appendHistory({
        type: def.label, number: parsed.number, customerName: customer.name, amount: payload.amount,
        url: output.url, status: status, customerId: customer.id, subject: parsed.subject,
        docDate: parsed.issueDate, deadline: parsed.dueDate, fileId: output.fileId,
      });
      SpreadsheetApp.flush();
    } catch (e) {
      try {
        DriveApp.getFileById(output.fileId).setTrashed(true);
      } catch (ignore) {
        // 削除できなくても、成功扱いにはしない
      }
      throw userError('PDFは作成できましたが「発行履歴」への記録に失敗したため、二重発行を防ぐためPDFを削除しました。\n「発行履歴」シートが削除・保護されていないか確認し、もう一度実行してください。');
    }
  } finally {
    lock.releaseLock();
  }

  // 5) 完了ダイアログ
  const mail = buildMailText_({
    docLabel: def.label, number: parsed.number, subject: parsed.subject, customer: customer,
    amount: payload.amount, amountNote: payload.amountNote, deadline: parsed.dueDate, settings: settings,
  });
  ss.toast(def.label + 'PDFを保存しました。', IQ.APP_NAME, 5);
  showResultDialog_({
    dialogTitle: '作成完了',
    heading: '✅ ' + def.label + 'PDFを作成しました' + (status === IQ.STATUS.REISSUED ? '（再発行）' : ''),
    fileName: output.name, url: output.url, mail: mail, warnings: output.warnings,
    elapsed: (Date.now() - startedAt) / 1000,
  });
}

/* =========================================================
 * 差し込みデータの組み立て
 * ======================================================= */

function buildIssuerValues_(settings) {
  return {
    '発行者名': normalizeText(settings.issuerName),
    '発行者郵便番号': normalizeText(settings.issuerPostal).replace(/^〒\s*/, ''),
    '発行者住所': normalizeText(settings.issuerAddress),
    '発行者電話': normalizeText(settings.issuerTel),
    '発行者メール': normalizeText(settings.issuerEmail),
    '登録番号': normalizeRegistrationNumber(settings.registrationNumber),
  };
}

function buildCustomerValues_(customer) {
  const r = buildRecipient(customer);
  return {
    '宛先1': r.line1,
    '宛先2': r.line2,
    '顧客郵便番号': customer.postal,
    '顧客住所': customer.address,
  };
}

function buildTotalsValues_(calc) {
  const g = calc.groups;
  return {
    '小計': formatNumber(calc.subtotal),
    '内訳10_対象': formatNumber(g[10].base),
    '内訳10_税': formatNumber(g[10].tax),
    '内訳8_対象': formatNumber(g[8].base),
    '内訳8_税': formatNumber(g[8].tax),
    '内訳0_対象': formatNumber(g[0].base),
    '消費税合計': formatNumber(calc.taxTotal),
    '合計': formatNumber(calc.total),
    '軽減税率注記': calc.hasReducedRate ? '※印は軽減税率（8%）対象品目です。' : '',
  };
}

function buildConditionalRows_(calc) {
  return {
    '内訳10_': calc.groups[10].count > 0,
    '内訳8_': calc.groups[8].count > 0,
    '内訳0_': calc.groups[0].count > 0,
    '源泉_': calc.withholding > 0,
  };
}

function buildItemsForDoc_(calc) {
  return calc.lines.map((l) => ({
    name: l.name + (l.taxRate === 8 ? ' ※' : ''),
    quantity: formatNumber(l.quantity),
    unitPrice: formatNumber(l.unitPrice),
    taxRate: l.taxRate + '%',
    amount: formatNumber(l.amount),
    note: l.note,
  }));
}

/** 振込先の表示文（例：〇〇銀行 渋谷支店 普通 1234567 / 口座名義：ヤマダ タロウ） */
function buildBankText_(settings) {
  const name = normalizeText(settings.bankName);
  const branch = normalizeText(settings.bankBranch);
  const kind = normalizeText(settings.bankType);
  const number = normalizeText(settings.bankNumber);
  const holder = normalizeText(settings.bankHolder);
  if (!name && !number) return '';
  const line1 = [name, branch, kind, number].filter((s) => s).join(' ');
  return holder ? line1 + '\n口座名義：' + holder : line1;
}

/** 請求書の差し込みデータ */
function buildInvoicePayload_(ctx) {
  const p = ctx.parsed;
  const calc = ctx.calc;
  const bank = buildBankText_(ctx.settings);
  const values = Object.assign({},
    buildIssuerValues_(ctx.settings),
    buildCustomerValues_(ctx.customer),
    buildTotalsValues_(calc),
    {
      '請求書番号': p.number,
      '発行日': formatPartsJa(p.issueDate),
      '支払期限': formatPartsJa(p.dueDate),
      '件名': p.subject,
      'ご請求金額': formatYen(calc.billingAmount) + '-',
      '源泉_税額': formatNumber(calc.withholding),
      '源泉_差引': formatYen(calc.billingAmount),
      '振込先見出し': bank ? '【お振込先】' : '',
      '振込先': bank,
      '備考見出し': p.notes ? '【備考】' : '',
      '備考': p.notes,
    });
  return {
    values: values,
    items: buildItemsForDoc_(calc),
    conditionalRows: buildConditionalRows_(calc),
    amount: calc.billingAmount,
    amountNote: calc.withholding > 0 ? '（源泉徴収税額 ' + formatYen(calc.withholding) + ' 差引後）' : '（税込）',
  };
}

/* =========================================================
 * メール文面（F06）
 * ======================================================= */

function buildSignature_(settings) {
  const custom = normalizeText(settings.mailSignature);
  if (custom) return custom;
  const line = '――――――――――――――――――';
  const lines = [line, normalizeText(settings.issuerName)];
  const postal = normalizeText(settings.issuerPostal).replace(/^〒\s*/, '');
  const address = normalizeText(settings.issuerAddress).replace(/\n/g, ' ');
  if (postal || address) lines.push((postal ? '〒' + postal + ' ' : '') + address);
  if (normalizeText(settings.issuerTel)) lines.push('TEL：' + normalizeText(settings.issuerTel));
  if (normalizeText(settings.issuerEmail)) lines.push('Mail：' + normalizeText(settings.issuerEmail));
  lines.push(line);
  return lines.join('\n');
}

/**
 * 送信用メールの件名・本文を作成する。
 * @param {{docLabel:string, number:string, subject:string, customer:Object, amount:number,
 *          amountNote:string, deadline:Object, settings:Object}} p
 * @return {{to:string, subject:string, body:string}}
 */
function buildMailText_(p) {
  const isInvoice = p.docLabel === '請求書';
  const s = p.settings;
  const issuer = normalizeText(s.issuerName);
  const recipient = buildRecipient(p.customer);
  const about = p.subject ? '「' + p.subject + '」の' : '';
  const note = p.amountNote == null ? '' : p.amountNote;
  const subject = (isInvoice ? '【請求書送付のご案内】' : '【お見積書送付のご案内】') +
    (p.subject || p.number) + '（' + issuer + '）';

  const lines = [recipient.salutation, '', 'いつもお世話になっております。', issuer + 'です。', ''];
  if (isInvoice) {
    lines.push(
      about + '請求書をお送りいたします。',
      '添付のPDFをご確認くださいますよう、お願いいたします。', '',
      '■ 請求書番号：' + p.number,
      '■ ご請求金額：' + formatYen(p.amount) + note,
      '■ お支払期限：' + formatPartsJa(p.deadline), '');
    const bank = buildBankText_(s);
    if (bank) {
      lines.push('お手数ではございますが、お支払期限までに下記口座へお振込みをお願いいたします。', '');
      bank.split('\n').forEach((l) => lines.push('　' + l));
      lines.push('');
    } else {
      lines.push('お手数ではございますが、お支払期限までにお支払いをお願いいたします。', '');
    }
    lines.push('ご不明な点がございましたら、お気軽にご連絡ください。', '今後ともよろしくお願いいたします。', '');
  } else {
    lines.push(
      about + 'お見積書をお送りいたします。',
      '添付のPDFをご確認くださいますよう、お願いいたします。', '',
      '■ 見積書番号：' + p.number,
      '■ お見積金額：' + formatYen(p.amount) + note,
      '■ 有効期限　：' + formatPartsJa(p.deadline), '',
      'ご不明な点やご要望がございましたら、お気軽にお申し付けください。',
      'ご検討のほど、よろしくお願いいたします。', '');
  }
  lines.push(buildSignature_(s));
  return { to: p.customer.email || '', subject: subject, body: lines.join('\n') };
}

/** 完了ダイアログ（PDF リンク・メール文面のコピー・Gmail 下書き） */
function showResultDialog_(o) {
  const e = escapeHtml;
  const gmailUrl = 'https://mail.google.com/mail/?view=cm&fs=1' +
    '&to=' + encodeURIComponent(o.mail.to || '') +
    '&su=' + encodeURIComponent(o.mail.subject) +
    '&body=' + encodeURIComponent(o.mail.body);
  const warnings = (o.warnings || []).map((w) => '<div class="warn">⚠️ ' + e(w) + '</div>').join('');
  const fileBlock = o.url
    ? '<div class="file">' + (o.fileName ? '<div class="name">' + e(o.fileName) + '</div>' : '') +
      '<a class="btn primary" href="' + e(o.url) + '" target="_blank" rel="noopener">PDFを開く</a></div>'
    : '';
  const html = '<!DOCTYPE html><html><head><base target="_top"><meta charset="utf-8"><style>' +
    'body{font-family:"Hiragino Sans","Noto Sans JP",Meiryo,sans-serif;color:#222;margin:0;padding:16px 18px;font-size:13px}' +
    'h2{font-size:16px;color:#1F2D4D;margin:0 0 10px}h3{font-size:13px;color:#1F2D4D;margin:16px 0 6px;border-left:4px solid #1F2D4D;padding-left:6px}' +
    '.file{background:#F3F5F9;border-radius:8px;padding:10px 12px;display:flex;align-items:center;gap:10px;justify-content:space-between}' +
    '.name{word-break:break-all;font-size:12px}' +
    '.btn{display:inline-block;border:1px solid #1F2D4D;color:#1F2D4D;background:#fff;border-radius:6px;padding:6px 12px;text-decoration:none;cursor:pointer;font-size:12px;white-space:nowrap}' +
    '.btn.primary{background:#1F2D4D;color:#fff}.btn:hover{opacity:.85}' +
    'label{display:block;font-size:11px;color:#5F6368;margin:8px 0 3px}' +
    '.row{display:flex;gap:6px}input,textarea{width:100%;box-sizing:border-box;border:1px solid #C9CED6;border-radius:6px;padding:6px 8px;font-size:12px;font-family:inherit;background:#FFFDF2}' +
    'textarea{height:230px;resize:vertical;line-height:1.5}' +
    '.actions{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}' +
    '.warn{background:#FEF7E0;border-radius:6px;padding:6px 10px;margin:8px 0;font-size:12px}' +
    '.note{font-size:11px;color:#5F6368;margin-top:10px}.ok{color:#188038;font-weight:bold;margin-left:6px;font-size:12px}' +
    '</style></head><body>' +
    '<h2>' + e(o.heading) + '</h2>' + fileBlock + warnings +
    '<h3>送信用メール文面</h3>' +
    '<label>宛先</label><div class="row"><input id="to" readonly value="' + e(o.mail.to || '（顧客マスタにメール未登録）') + '"><button class="btn" onclick="copy(\'to\')">コピー</button></div>' +
    '<label>件名</label><div class="row"><input id="subject" readonly value="' + e(o.mail.subject) + '"><button class="btn" onclick="copy(\'subject\')">コピー</button></div>' +
    '<label>本文</label><textarea id="body" readonly>' + e(o.mail.body) + '</textarea>' +
    '<div class="actions"><button class="btn primary" onclick="copy(\'body\')">本文をコピー</button>' +
    '<a class="btn" href="' + e(gmailUrl) + '" target="_blank" rel="noopener">Gmailで下書きを開く</a>' +
    '<button class="btn" onclick="google.script.host.close()">閉じる</button><span id="msg" class="ok"></span></div>' +
    '<div class="note">※PDFは自動添付されません。「PDFを開く」からダウンロードして添付してください。' +
    (o.elapsed ? '　処理時間：' + o.elapsed.toFixed(1) + '秒' : '') + '</div>' +
    '<script>function copy(id){var el=document.getElementById(id);el.focus();el.select();' +
    'try{el.setSelectionRange(0,el.value.length);}catch(e){}var ok=false;try{ok=document.execCommand("copy");}catch(e){}' +
    'var m=document.getElementById("msg");if(ok){m.textContent="コピーしました";setTimeout(function(){m.textContent="";},2000);return;}' +
    'if(navigator.clipboard){navigator.clipboard.writeText(el.value).then(function(){m.textContent="コピーしました";},function(){m.textContent="選択済みです。Ctrl+C（⌘+C）でコピーしてください";});}' +
    'else{m.textContent="選択済みです。Ctrl+C（⌘+C）でコピーしてください";}}</script>' +
    '</body></html>';
  const output = HtmlService.createHtmlOutput(html).setWidth(580).setHeight(640);
  SpreadsheetApp.getUi().showModalDialog(output, IQ.APP_NAME + '：' + (o.dialogTitle || ''));
}

/* =========================================================
 * 入力シートの準備（請求書・見積書 共通）
 * ======================================================= */

function hasDocumentInput_(sheet) {
  const raw = readDocumentInput_(sheet);
  if (normalizeText(raw.number) || normalizeText(raw.customerId)) return true;
  return raw.items.some((r) => normalizeText(r.name) || normalizeText(r.qty) || normalizeText(r.price));
}

function clearDocumentInputs_(sheet) {
  const L = IQ_INPUT_LAYOUT;
  const last = L.itemStartRow + L.maxItems - 1;
  sheet.getRangeList([
    L.number, L.issueDate, L.dueDate, L.customerId, L.subject, L.option, L.notes,
    'B' + L.itemStartRow + ':E' + last,
    'G' + L.itemStartRow + ':G' + last,
  ]).clearContent();
  const rates = [];
  for (let i = 0; i < L.maxItems; i++) rates.push([CALC_DEFAULT_TAX_RATE]);
  sheet.getRange(L.itemStartRow, L.col.rate, L.maxItems, 1).setValues(rates);
}

/**
 * 入力シートをクリアし、番号・発行日・期限などの初期値を入れる。
 * @param {Object} def getDocTypeDef_() の戻り値
 * @param {{confirm:boolean}} options confirm=true なら入力済みのとき確認する
 * @return {boolean} 準備したら true
 */
function prepareDocumentSheet_(def, options) {
  const ui = SpreadsheetApp.getUi();
  const sheet = getRequiredSheet_(def.sheetName);
  const settings = getSettings();
  const L = IQ_INPUT_LAYOUT;
  if (options && options.confirm && hasDocumentInput_(sheet)) {
    const answer = ui.alert(
      '新しい' + def.label + 'を準備',
      '入力中の内容（番号・顧客・明細など）をクリアして、新しい' + def.label + 'を準備します。\nよろしいですか？\n\n※発行済みの書類は「発行履歴」とGoogleドライブに残っています。',
      ui.ButtonSet.YES_NO);
    if (answer !== ui.Button.YES) return false;
  }
  clearDocumentInputs_(sheet);

  const today = todayParts_();
  let due;
  if (def.type === 'invoice') {
    due = computeDueDate(today, settings.paymentTerm);
  } else {
    let days = parseInt(toHalfWidth(settings.estimateValidDays), 10);
    if (!(days >= 1 && days <= 365)) days = 30;
    due = addDaysToParts(today, days);
  }
  sheet.getRange(L.number).setValue(nextDocumentNumber(def.label, settings[def.prefixKey], today));
  sheet.getRange(L.issueDate).setValue(formatPartsSlash(today));
  sheet.getRange(L.dueDate).setValue(formatPartsSlash(due));
  if (def.type === 'invoice') {
    sheet.getRange(L.option).setValue('しない');
    sheet.getRange(L.notes).setValue(normalizeText(settings.invoiceDefaultNote));
  } else {
    sheet.getRange(L.option).setValue(normalizeText(settings.estimateDefaultTerms));
  }
  sheet.activate();
  sheet.getRange(L.customerId).activate();
  return true;
}
