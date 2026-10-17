/**
 * Estimate.gs
 * 見積書作成のメイン処理。
 * PDF 作成の流れ（入力チェック → 計算 → 排他制御 → PDF → 履歴）は Invoice.gs の共通エンジンを使用します。
 */

/** メニュー：📝 見積書PDFを作成 */
function createEstimatePdf() {
  runSafely_('見積書PDFの作成', () => runDocumentGeneration_('estimate'));
}

/** メニュー：🆕 新しい見積書を準備 */
function prepareNewEstimate() {
  runSafely_('新しい見積書の準備', () => {
    if (prepareDocumentSheet_(getDocTypeDef_('estimate'), { confirm: true })) {
      SpreadsheetApp.getActive().toast('番号・発行日・有効期限・見積条件を入力しました。顧客IDを▼から選び、明細を入力してください。', IQ.APP_NAME, 8);
    }
  });
}

/** 見積書の差し込みデータ */
function buildEstimatePayload_(ctx) {
  const p = ctx.parsed;
  const calc = ctx.calc;
  const values = Object.assign({},
    buildIssuerValues_(ctx.settings),
    buildCustomerValues_(ctx.customer),
    buildTotalsValues_(calc),
    {
      '見積書番号': p.number,
      '発行日': formatPartsJa(p.issueDate),
      '有効期限': formatPartsJa(p.dueDate),
      '件名': p.subject,
      '見積金額': formatYen(calc.total) + '-',
      '見積条件見出し': p.terms ? '【お見積条件】' : '',
      '見積条件': p.terms,
      '備考見出し': p.notes ? '【備考】' : '',
      '備考': p.notes,
    });
  return {
    values: values,
    items: buildItemsForDoc_(calc),
    conditionalRows: buildConditionalRows_(calc),
    amount: calc.total,
    amountNote: '（税込）',
  };
}

/** メニュー：🔁 見積書の内容を請求書へ転記 */
function copyEstimateToInvoice() {
  runSafely_('見積書から請求書への転記', () => {
    const ui = SpreadsheetApp.getUi();
    const L = IQ_INPUT_LAYOUT;
    const estimateSheet = getRequiredSheet_(IQ.SHEETS.ESTIMATE);
    const invoiceSheet = getRequiredSheet_(IQ.SHEETS.INVOICE);
    const raw = readDocumentInput_(estimateSheet);
    const hasItems = raw.items.some((r) => normalizeText(r.name));
    if (!normalizeText(raw.customerId) && !hasItems) {
      throw userError('「見積書入力」シートに転記できる内容（顧客ID・明細）がありません。', { sheet: IQ.SHEETS.ESTIMATE, cell: L.customerId });
    }
    const answer = ui.alert(
      '見積書の内容を請求書へ転記',
      '「見積書入力」の顧客ID・件名・明細を「請求書入力」へ転記します。\n\n' +
      '・請求書入力シートの現在の内容はクリアされます\n' +
      '・請求書番号・発行日・支払期限は新しく自動入力されます\n\n実行しますか？',
      ui.ButtonSet.YES_NO);
    if (answer !== ui.Button.YES) return;

    prepareDocumentSheet_(getDocTypeDef_('invoice'), { confirm: false });
    invoiceSheet.getRange(L.customerId).setValue(normalizeText(raw.customerId));
    invoiceSheet.getRange(L.subject).setValue(normalizeText(raw.subject));
    const blank = (v) => v === null || v === undefined || String(v).trim() === '';
    invoiceSheet.getRange(L.itemStartRow, L.col.name, L.maxItems, 4).setValues(
      raw.items.map((r) => [r.name, r.qty, r.price, blank(r.rate) ? CALC_DEFAULT_TAX_RATE : r.rate]));
    invoiceSheet.getRange(L.itemStartRow, L.col.note, L.maxItems, 1).setValues(raw.items.map((r) => [r.note]));
    invoiceSheet.activate();
    invoiceSheet.getRange(L.number).activate();
    SpreadsheetApp.getActive().toast('転記しました。内容を確認して「📄 請求書PDFを作成」を実行してください。', IQ.APP_NAME, 8);
  });
}
