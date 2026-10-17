/**
 * Main.gs
 * メニュー登録（onOpen）、ワンクリック初期セットアップ、シートの作成、エラー処理の共通窓口。
 *
 * Invoice Quick v1.0.0
 * 必要なもの：Google アカウントのみ（外部API・外部ライブラリ・月額費用なし）
 */

/* =========================================================
 * メニュー
 * ======================================================= */

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu(IQ.APP_NAME)
    .addItem('📄 請求書PDFを作成', 'createInvoicePdf')
    .addItem('📝 見積書PDFを作成', 'createEstimatePdf')
    .addSeparator()
    .addItem('🆕 新しい請求書を準備（番号・日付を自動入力）', 'prepareNewInvoice')
    .addItem('🆕 新しい見積書を準備（番号・日付を自動入力）', 'prepareNewEstimate')
    .addItem('🔁 見積書の内容を請求書へ転記', 'copyEstimateToInvoice')
    .addSeparator()
    .addItem('✉️ メール文面を作成（発行履歴の選択行）', 'showMailTextFromHistory')
    .addSeparator()
    .addItem('⚙️ 初期セットアップ（最初に1回）', 'setupInvoiceQuick')
    .addSubMenu(ui.createMenu('🛠 設定・メンテナンス')
      .addItem('書類テンプレートを再作成', 'recreateTemplates')
      .addItem('入力シートを初期状態に戻す', 'resetInputSheets'))
    .addItem('❓ 使い方を表示', 'showHelp')
    .addToUi();
}

/* =========================================================
 * エラー処理の共通窓口
 * ======================================================= */

/**
 * メニューから呼ばれる処理を実行し、エラーを分かりやすい日本語で表示する。
 * 技術的な例外の内容（入力値・ID などを含み得る）はログに残さず、エラーコードのみ記録する。
 */
function runSafely_(actionLabel, fn) {
  try {
    return fn();
  } catch (e) {
    handleError_(e, actionLabel);
    return null;
  }
}

function handleError_(e, actionLabel) {
  let ui = null;
  try {
    ui = SpreadsheetApp.getUi();
  } catch (ignore) {
    // スクリプトエディタから実行した場合など
  }
  if (isUserError(e)) {
    focusCell_(e.focus);
    if (ui) ui.alert(IQ.APP_NAME, e.message, ui.ButtonSet.OK);
    else console.warn('[InvoiceQuick] ' + actionLabel + ': ' + e.message);
    return;
  }
  const info = translateSystemError_(e);
  console.error('[InvoiceQuick] ' + actionLabel + ' failed. code=' + info.code + ' type=' + (e && e.name ? e.name : 'unknown'));
  if (ui) {
    ui.alert(IQ.APP_NAME + '：' + actionLabel + 'に失敗しました',
      info.message + '\n\n（エラーコード：' + info.code + '　※お問い合わせの際はこのコードをお知らせください）',
      ui.ButtonSet.OK);
  }
}

/** Google のシステムエラーを、利用者が取るべき手順に変換する */
function translateSystemError_(e) {
  const msg = String((e && e.message) || '');
  if (/Exceeded maximum execution time|timed out|タイムアウト|実行時間/i.test(msg)) {
    return { code: 'E104', message: '処理に時間がかかりすぎて中断されました。\nGoogle側が混み合っている可能性があります。1〜2分おいてから、もう一度実行してください。\n（PDFが二重に作られていないか「発行履歴」とDriveをご確認ください）' };
  }
  if (/too many times|quota|Limit Exceeded|上限|回数/i.test(msg)) {
    return { code: 'E103', message: 'Googleの1日あたりの利用上限に達した可能性があります。\n時間をおいて（翌日以降）再度お試しください。' };
  }
  if (/storage|容量|space/i.test(msg)) {
    return { code: 'E105', message: 'Googleドライブの空き容量が不足している可能性があります。\n不要なファイルを削除してから、もう一度実行してください。' };
  }
  if (/permission|Access denied|権限|authoriz|承認|許可/i.test(msg)) {
    return { code: 'E102', message: '権限が不足しているため実行できませんでした。\n・メニューから再度実行し、承認画面が出たら「許可」を押してください。\n・保存先フォルダやテンプレートを他の人と共有している場合は、編集権限があるか確認してください。' };
  }
  if (/not found|No item with the given ID|does not exist|見つかりません|存在しません|Invalid argument: id/i.test(msg)) {
    return { code: 'E101', message: '保存先フォルダまたは書類テンプレートが見つかりません（削除・移動された可能性があります）。\n・「初期設定」のPDF保存先フォルダIDを空欄にして「⚙️ 初期セットアップ」を実行する\n・または「🛠 設定・メンテナンス」→「書類テンプレートを再作成」を実行してください。' };
  }
  return { code: 'E199', message: '予期しないエラーが発生しました。\n・ページを再読み込みしてから、もう一度実行してください。\n・解決しない場合は「🛠 設定・メンテナンス」→「入力シートを初期状態に戻す」をお試しください（顧客マスタ・履歴・設定は消えません）。' };
}

/* =========================================================
 * 初期セットアップ（F07）
 * ======================================================= */

/**
 * ワンクリック初期化。
 * 必要なシート・保存先フォルダ・請求書／見積書テンプレート（Google ドキュメント）を自動作成し、
 * テンプレートIDとフォルダIDを「初期設定」シートに自動セットする。
 * 何度実行しても既存のデータは消えない（不足しているものだけ作成）。
 */
function setupInvoiceQuick() {
  runSafely_('初期セットアップ', () => {
    const ss = SpreadsheetApp.getActive();
    const ui = SpreadsheetApp.getUi();
    const answer = ui.alert(
      'Invoice Quick 初期セットアップ',
      '必要なシートと、請求書・見積書のテンプレート（Googleドキュメント）、PDFの保存先フォルダを自動で作成します。\n\n' +
      '・所要時間：10〜30秒ほど\n・すでに入力済みのデータは消えません（何度実行しても大丈夫です）\n\n実行しますか？',
      ui.ButtonSet.YES_NO);
    if (answer !== ui.Button.YES) return;

    const lock = LockService.getDocumentLock();
    if (!lock.tryLock(IQ.LOCK_WAIT_MS)) throw userError('別の処理を実行中です。完了してから、もう一度実行してください。');
    let folder = null;
    let createdTemplates = [];
    try {
      ss.toast('シートを準備しています…', IQ.APP_NAME, 30);
      ensureReadmeSheet_(ss);
      ensureSettingsSheet_(ss);
      ensureRoundingNamedRange_(ss);
      ensureCustomerSheet_(ss);
      ['invoice', 'estimate'].forEach((type) => {
        if (!ss.getSheetByName(getDocTypeDef_(type).sheetName)) buildInputSheet_(ss, type);
      });
      ensureHistorySheet_(ss);
      orderSheets_(ss);
      removeEmptyDefaultSheets_(ss);
      SpreadsheetApp.flush();

      ss.toast('保存先フォルダと書類テンプレートを作成しています…', IQ.APP_NAME, 30);
      const settings = getSettings();
      folder = ensureRootFolder_(settings, true);
      createdTemplates = ensureTemplates_(getSettings(), folder, false);
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }

    // 入力シートが空なら、番号・日付を入れておく（すぐ試せるように）
    ['invoice', 'estimate'].forEach((type) => {
      const def = getDocTypeDef_(type);
      if (!hasDocumentInput_(getRequiredSheet_(def.sheetName))) prepareDocumentSheet_(def, { confirm: false });
    });

    const settingsSheet = ss.getSheetByName(IQ.SHEETS.SETTINGS);
    settingsSheet.activate();
    settingsSheet.getRange(settingFocus_('issuerName').cell).activate();
    ui.alert(
      '✅ セットアップが完了しました',
      '次の3ステップで使い始められます。\n\n' +
      '① 「初期設定」シートの黄色いセルに、発行者名・住所・振込先などを入力\n' +
      '② 「顧客マスタ」シートに取引先を登録（サンプル行は削除してOK）\n' +
      '③ 「請求書入力」で顧客IDを選び、明細を入力 → メニュー「📄 請求書PDFを作成」\n\n' +
      'PDFの保存先：Googleドライブ「' + folder.getName() + '」フォルダ\n' +
      (createdTemplates.length ? '作成したテンプレート：' + createdTemplates.join('・') + '\n' : 'テンプレート：作成済みのものをそのまま使用します\n') +
      '\n※使い方は「README」シート、またはメニュー「❓ 使い方を表示」で確認できます。',
      ui.ButtonSet.OK);
  });
}

/**
 * テンプレートが無い（または無効な）場合に作成し、IDを「初期設定」に保存する。
 * @param {boolean} force true なら既存があっても新しく作成する
 * @return {string[]} 作成した書類名
 */
function ensureTemplates_(settings, rootFolder, force) {
  const templateFolder = getOrCreateSubfolder_(rootFolder, IQ.TEMPLATE_FOLDER_NAME);
  const created = [];
  ['invoice', 'estimate'].forEach((type) => {
    const def = getDocTypeDef_(type);
    const current = tryGetDocFile_(extractDriveId(settings[def.templateKey]));
    if (current && !force) return;
    const id = createDocumentTemplate_(type, templateFolder);
    setSetting(def.templateKey, id);
    created.push(def.label);
  });
  return created;
}

/** メニュー：書類テンプレートを再作成 */
function recreateTemplates() {
  runSafely_('テンプレートの再作成', () => {
    const ui = SpreadsheetApp.getUi();
    const answer = ui.alert(
      '書類テンプレートを再作成',
      '請求書・見積書のテンプレート（Googleドキュメント）を新しく作り直し、「初期設定」のテンプレートIDを更新します。\n\n' +
      '・これまでのテンプレートは削除されずDriveに残ります（デザインを変更していた場合は注意）\n' +
      '・作成済みのPDFには影響しません\n\n実行しますか？',
      ui.ButtonSet.YES_NO);
    if (answer !== ui.Button.YES) return;
    const settings = getSettings();
    const folder = ensureRootFolder_(settings, false);
    ensureTemplates_(settings, folder, true);
    ui.alert(IQ.APP_NAME, '新しいテンプレートを作成しました。\n保存先：「' + folder.getName() + '」フォルダ内の「' + IQ.TEMPLATE_FOLDER_NAME + '」', ui.ButtonSet.OK);
  });
}

/** メニュー：入力シートを初期状態に戻す */
function resetInputSheets() {
  runSafely_('入力シートのリセット', () => {
    const ss = SpreadsheetApp.getActive();
    const ui = SpreadsheetApp.getUi();
    const answer = ui.alert(
      '入力シートを初期状態に戻す',
      '「請求書入力」「見積書入力」シートを作り直します（数式やレイアウトが崩れた場合の修復用）。\n\n' +
      '・入力中の内容は消えます\n・初期設定・顧客マスタ・発行履歴・作成済みPDFは消えません\n\n実行しますか？',
      ui.ButtonSet.YES_NO);
    if (answer !== ui.Button.YES) return;
    getRequiredSheet_(IQ.SHEETS.SETTINGS);
    getRequiredSheet_(IQ.SHEETS.CUSTOMERS);
    rebuildInputSheets_(ss);
    ['invoice', 'estimate'].forEach((type) => prepareDocumentSheet_(getDocTypeDef_(type), { confirm: false }));
    ss.toast('入力シートを初期状態に戻しました。', IQ.APP_NAME, 5);
  });
}

function rebuildInputSheets_(ss) {
  ensureRoundingNamedRange_(ss);
  ['invoice', 'estimate'].forEach((type) => {
    const name = getDocTypeDef_(type).sheetName;
    const old = ss.getSheetByName(name);
    if (old) ss.deleteSheet(old);
    buildInputSheet_(ss, type);
  });
  orderSheets_(ss);
}

/** メニュー：使い方を表示 */
function showHelp() {
  runSafely_('使い方の表示', () => {
    const ss = SpreadsheetApp.getActive();
    const readme = ss.getSheetByName(IQ.SHEETS.README);
    if (readme) readme.activate();
    const ui = SpreadsheetApp.getUi();
    ui.alert('Invoice Quick の使い方',
      '【毎回の流れ（約1分）】\n' +
      '1. メニュー「🆕 新しい請求書を準備」→ 番号・発行日・支払期限が自動入力されます\n' +
      '2. 顧客IDを▼から選び、明細（品名・数量・単価・税率）を入力\n' +
      '3. メニュー「📄 請求書PDFを作成」→ PDF保存＋メール文面が表示されます\n\n' +
      '【セルの色】黄色＝入力　灰色＝自動（編集不要）　赤い * ＝必須\n\n' +
      '【見積書から請求書へ】メニュー「🔁 見積書の内容を請求書へ転記」\n' +
      '【メール文面だけ作り直す】「発行履歴」で行を選び「✉️ メール文面を作成」\n\n' +
      '詳しくは「README」シートと、購入ページのマニュアル・FAQをご覧ください。',
      ui.ButtonSet.OK);
  });
}

/* =========================================================
 * シート作成
 * ======================================================= */

function orderSheets_(ss) {
  const S = IQ.SHEETS;
  const active = ss.getActiveSheet();
  let position = 1;
  [S.README, S.SETTINGS, S.CUSTOMERS, S.INVOICE, S.ESTIMATE, S.HISTORY].forEach((name) => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(position++);
  });
  if (active) ss.setActiveSheet(active);
}

/** 新規スプレッドシートの空の「シート1」を削除 */
function removeEmptyDefaultSheets_(ss) {
  ss.getSheets().forEach((sheet) => {
    if (ss.getSheets().length <= 1) return;
    if (/^(シート|Sheet)\d+$/.test(sheet.getName()) && sheet.getLastRow() === 0 && sheet.getLastColumn() === 0) {
      ss.deleteSheet(sheet);
    }
  });
}

function ensureReadmeSheet_(ss) {
  return ss.getSheetByName(IQ.SHEETS.README) || buildReadmeSheet_(ss);
}

function buildReadmeSheet_(ss) {
  const sheet = ss.insertSheet(IQ.SHEETS.README);
  const rows = [
    ['title', 'Invoice Quick　請求書・見積書をワンクリックでPDFに'],
    ['p', 'バージョン ' + IQ.VERSION + '　｜　Googleアカウントだけで動作（外部サービス・月額費用なし）　｜　初期設定と書類作成はPCがおすすめです'],
    ['h', 'はじめに（最初の1回だけ・約5分）'],
    ['p', '1. メニュー「Invoice Quick」→「⚙️ 初期セットアップ（最初に1回）」を実行します。初回はGoogleの承認画面が表示されます（手順は導入マニュアルを参照）。'],
    ['p', '2. 「初期設定」シートの黄色いセルに、発行者名・住所・振込先・登録番号（お持ちの場合）を入力します。'],
    ['p', '3. 「顧客マスタ」シートに取引先を登録します（サンプル行は削除してOK）。'],
    ['h', '毎回の使い方（約1分）'],
    ['p', '1. メニュー「🆕 新しい請求書を準備」→ 請求書番号・発行日・支払期限が自動で入ります。'],
    ['p', '2. 顧客IDを▼から選び、明細（品名・数量・単価・税率）を入力します。金額は税抜で入力してください。'],
    ['p', '3. メニュー「📄 請求書PDFを作成」→ PDFがGoogleドライブに保存され、送信用のメール文面も表示されます。'],
    ['p', '見積書も同じ流れです。受注したら「🔁 見積書の内容を請求書へ転記」で入力の手間を省けます。'],
    ['h', 'シートの説明'],
    ['p', '初期設定 … 発行者情報・振込先・端数処理・番号の接頭辞・保存先など'],
    ['p', '顧客マスタ … 取引先の一覧（顧客ID・顧客名・担当者・住所・メールなど）'],
    ['p', '請求書入力 / 見積書入力 … 作成する書類の内容。合計欄は入力に合わせて自動計算されます'],
    ['p', '発行履歴 … 発行した書類の一覧（自動記録）。取り消した書類はステータスを「取消」にします'],
    ['h', 'セルの色'],
    ['legend', ''],
    ['h', '困ったときは'],
    ['p', 'エラーが出たら、メッセージに書かれたシートとセルを修正して、もう一度実行してください。該当セルは自動で選択されます。'],
    ['p', 'レイアウトが崩れたら「🛠 設定・メンテナンス」→「入力シートを初期状態に戻す」（初期設定・顧客・履歴は消えません）。'],
    ['p', '※本ツールは計算と書類作成を補助するものです。インボイス制度・源泉徴収など税務上の判断は、税理士または税務署にご確認ください。'],
  ];
  sheet.setColumnWidth(1, 24);
  sheet.setColumnWidth(2, 860);
  rows.forEach((r, i) => {
    const row = i + 1;
    const cell = sheet.getRange(row, 2);
    if (r[0] === 'title') {
      cell.setValue(r[1]).setFontSize(16);
      styleHeader_(sheet.getRange(row, 1, 1, 2));
      sheet.setRowHeight(row, 44);
    } else if (r[0] === 'h') {
      cell.setValue('■ ' + r[1]);
      styleSection_(sheet.getRange(row, 1, 1, 2));
      sheet.setRowHeight(row, 30);
    } else if (r[0] === 'legend') {
      cell.setValue('黄色＝入力するセル　　灰色＝自動表示・自動計算（編集不要）　　赤い * ＝必須項目');
      sheet.getRange(row, 1).setBackground(IQ.COLORS.INPUT);
      sheet.setRowHeight(row, 28);
    } else {
      cell.setValue(r[1]).setWrap(true);
      sheet.setRowHeight(row, 26);
    }
    cell.setVerticalAlignment('middle');
  });
  sheet.setHiddenGridlines(true);
  return sheet;
}

/** 端数処理に従って丸めるシート数式（プレビュー用。スクリプトの計算と同じルール） */
function roundingFormula_(expr) {
  const n = IQ.NAMED_RANGE_ROUNDING;
  return 'IF(' + n + '="切り上げ",ROUNDUP(' + expr + ',0),IF(' + n + '="四捨五入",ROUND(' + expr + ',0),ROUNDDOWN(' + expr + ',0)))';
}

/**
 * 「請求書入力」「見積書入力」シートを作成する。
 * @param {string} type 'invoice' | 'estimate'
 */
function buildInputSheet_(ss, type) {
  const def = getDocTypeDef_(type);
  const isInvoice = type === 'invoice';
  const L = IQ_INPUT_LAYOUT;
  const C = IQ.COLORS;
  const sheet = ss.insertSheet(def.sheetName);
  const lastItemRow = L.itemStartRow + L.maxItems - 1;
  const border = (range) => range.setBorder(true, true, true, true, true, true, C.BORDER, SpreadsheetApp.BorderStyle.SOLID);

  [44, 230, 80, 110, 70, 120, 240].forEach((w, i) => sheet.setColumnWidth(i + 1, w));
  sheet.setHiddenGridlines(true);

  // タイトル・説明
  sheet.getRange('A1:G1').merge().setValue(def.label + '入力').setFontSize(15).setHorizontalAlignment('left');
  styleHeader_(sheet.getRange('A1:G1'));
  sheet.setRowHeight(1, 38);
  sheet.getRange('A2:G2').merge()
    .setValue('① 黄色のセルに入力　→　② メニュー「Invoice Quick」→「' + (isInvoice ? '📄 請求書PDFを作成' : '📝 見積書PDFを作成') + '」　※灰色のセルは自動表示・自動計算です')
    .setFontColor(C.HINT).setWrap(true).setVerticalAlignment('middle');
  sheet.setRowHeight(2, 34);

  // 基本情報
  sheet.getRange('A3:G3').merge().setValue('■ 基本情報');
  styleSection_(sheet.getRange('A3:G3'));
  const fields = [
    { row: 4, label: def.numberLabel, required: true, kind: 'input', range: 'C4:E4', hint: 'メニュー「🆕 新しい' + def.label + 'を準備」で自動採番' },
    { row: 5, label: '発行日', required: true, kind: 'input', range: 'C5:E5', hint: '例）2026/10/17' },
    { row: 6, label: def.dueLabel, required: true, kind: 'input', range: 'C6:E6', hint: isInvoice ? '初期値は「初期設定」の支払期限ルール' : '初期値は発行日＋有効日数' },
    { row: 7, label: '顧客ID', required: true, kind: 'input', range: 'C7:E7', hint: '▼から選択（「顧客マスタ」に登録したID）' },
    { row: 8, label: '顧客名', kind: 'auto', range: 'C8:G8' },
    { row: 9, label: '担当者', kind: 'auto', range: 'C9:G9' },
    { row: 10, label: '郵便番号', kind: 'auto', range: 'C10:G10' },
    { row: 11, label: '住所', kind: 'auto', range: 'C11:G11' },
    { row: 12, label: 'メール', kind: 'auto', range: 'C12:G12' },
    { row: 13, label: '件名', kind: 'input', range: 'C13:G13' },
    isInvoice
      ? { row: 14, label: '源泉徴収', kind: 'input', range: 'C14:E14', hint: '個人への報酬などで必要な場合のみ「する」' }
      : { row: 14, label: '見積条件', kind: 'input', range: 'C14:G14' },
    { row: 15, label: '備考', kind: 'input', range: 'C15:G15' },
  ];
  fields.forEach((f) => {
    setLabel_(sheet.getRange(f.row, 2), f.label, f.required).setFontWeight('bold').setVerticalAlignment('middle');
    const range = sheet.getRange(f.range).merge();
    range.setBackground(f.kind === 'input' ? C.INPUT : C.AUTO).setVerticalAlignment('middle').setHorizontalAlignment('left').setWrap(true);
    border(range);
    if (f.hint) sheet.getRange(f.row, 6, 1, 2).merge().setValue(f.hint).setFontColor(C.HINT).setFontSize(9).setVerticalAlignment('middle').setWrap(true);
    sheet.setRowHeight(f.row, 26);
  });
  sheet.setRowHeight(14, isInvoice ? 26 : 52);
  sheet.setRowHeight(15, 52);

  sheet.getRange(L.number).setNumberFormat('@');
  sheet.getRange(L.customerId).setNumberFormat('@');
  sheet.getRange(L.issueDate + ':' + L.dueDate).setNumberFormat('yyyy/mm/dd');
  const dateRule = SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false)
    .setHelpText('日付を入力してください（例：2026/10/17）。セルをダブルクリックするとカレンダーが表示されます。').build();
  sheet.getRange(L.issueDate).setDataValidation(dateRule);
  sheet.getRange(L.dueDate).setDataValidation(dateRule);
  sheet.getRange(L.customerId).setDataValidation(buildCustomerIdValidation_(ss));
  if (isInvoice) {
    sheet.getRange(L.option).setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(['しない', 'する'], true).setAllowInvalid(false).build());
  }

  // 顧客マスタからの自動表示（数式）
  const lookup = (col, notFound) => '=IF($C$7="","",IFERROR(VLOOKUP($C$7,\'' + IQ.SHEETS.CUSTOMERS + '\'!$A$2:$H$' + IQ_CUSTOMER_MAX_ROWS + ',' + col + ',FALSE),"' + notFound + '"))';
  sheet.getRange(L.customerName).setFormula(lookup(2, '（顧客マスタに未登録のIDです）'));
  sheet.getRange(L.contact).setFormula(lookup(3, ''));
  sheet.getRange(L.postal).setFormula(lookup(4, ''));
  sheet.getRange(L.address).setFormula(lookup(5, ''));
  sheet.getRange(L.email).setFormula(lookup(6, ''));

  // 明細
  sheet.getRange('A16:G16').merge().setValue('■ 明細（最大' + L.maxItems + '行）　金額は税抜で入力／値引きは単価をマイナスで入力');
  styleSection_(sheet.getRange('A16:G16'));
  const headers = [['No', false], ['品名・内容', true], ['数量', true], ['単価（税抜）', true], ['税率', false], ['金額（税抜）', false], ['備考（明細の補足）', false]];
  const headerRange = sheet.getRange(L.itemHeaderRow, 1, 1, headers.length);
  styleHeader_(headerRange).setHorizontalAlignment('center');
  headers.forEach((h, i) => setLabel_(sheet.getRange(L.itemHeaderRow, i + 1), h[0], h[1], true));
  sheet.setRowHeight(L.itemHeaderRow, 28);

  const n = L.maxItems;
  const noValues = [];
  const amountFormulas = [];
  const rates = [];
  for (let i = 0; i < n; i++) {
    const r = L.itemStartRow + i;
    noValues.push([i + 1]);
    rates.push([CALC_DEFAULT_TAX_RATE]);
    amountFormulas.push(['=IF(OR(C' + r + '="",D' + r + '=""),"",IFERROR(' + roundingFormula_('ROUND(C' + r + '*D' + r + ',8)') + ',"要確認"))']);
  }
  sheet.getRange(L.itemStartRow, 1, n, 1).setValues(noValues).setBackground(C.AUTO).setHorizontalAlignment('center').setFontColor(C.HINT);
  sheet.getRange(L.itemStartRow, 2, n, 4).setBackground(C.INPUT);
  sheet.getRange(L.itemStartRow, 7, n, 1).setBackground(C.INPUT).setWrap(true);
  sheet.getRange(L.itemStartRow, 3, n, 2).setHorizontalAlignment('right');
  sheet.getRange(L.itemStartRow, 5, n, 1).setValues(rates).setNumberFormat('0"%"').setHorizontalAlignment('center')
    .setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(['10', '8', '0'], true).setAllowInvalid(false)
      .setHelpText('10＝標準税率、8＝軽減税率（飲食料品など）、0＝非課税・不課税など').build());
  sheet.getRange(L.itemStartRow, 6, n, 1).setFormulas(amountFormulas).setBackground(C.AUTO).setNumberFormat('#,##0').setHorizontalAlignment('right');
  border(sheet.getRange(L.itemHeaderRow, 1, n + 1, 7));
  sheet.getRange(L.itemStartRow, 1, n, 7).setVerticalAlignment('middle');

  // 合計（プレビュー）
  const s = L.summaryStartRow;
  const F = (row) => 'F' + row;
  const itemF = 'F' + L.itemStartRow + ':F' + lastItemRow;
  const itemE = 'E' + L.itemStartRow + ':E' + lastItemRow;
  sheet.getRange(s - 1, 1, 1, 7).merge().setValue('■ 合計（自動計算）　※PDFはスクリプトが同じルールで再計算・検算してから作成します');
  styleSection_(sheet.getRange(s - 1, 1, 1, 7));
  const summary = [
    ['10%対象（税抜）', '=SUM(' + itemF + ')-SUMIF(' + itemE + ',8,' + itemF + ')-SUMIF(' + itemE + ',0,' + itemF + ')'],
    ['消費税（10%）', '=' + roundingFormula_(F(s) + '*10/100')],
    ['8%対象（税抜）※軽減税率', '=SUMIF(' + itemE + ',8,' + itemF + ')'],
    ['消費税（8%）', '=' + roundingFormula_(F(s + 2) + '*8/100')],
    ['0%対象（非課税・不課税等）', '=SUMIF(' + itemE + ',0,' + itemF + ')'],
    ['小計（税抜）', '=' + F(s) + '+' + F(s + 2) + '+' + F(s + 4)],
    ['消費税合計', '=' + F(s + 1) + '+' + F(s + 3)],
    ['合計（税込）', '=' + F(s + 5) + '+' + F(s + 6)],
  ];
  if (isInvoice) {
    const base = F(s + 5);
    summary.push(['源泉徴収税額', '=IF($C$14="する",IF(' + base + '<=0,0,IF(' + base + '<=1000000,ROUNDDOWN(' + base + '*1021/10000,0),ROUNDDOWN((' + base + '-1000000)*2042/10000,0)+102100)),0)']);
    summary.push(['ご請求金額', '=' + F(s + 7) + '-' + F(s + 8)]);
  }
  summary.forEach((item, i) => {
    const row = s + i;
    sheet.getRange(row, 2, 1, 4).merge().setValue(item[0]).setHorizontalAlignment('right').setBackground('#F7F8FA');
    sheet.getRange(row, 6).setFormula(item[1]).setBackground(C.AUTO).setNumberFormat('#,##0').setHorizontalAlignment('right');
    border(sheet.getRange(row, 2, 1, 5));
    sheet.setRowHeight(row, 24);
  });
  const finalRow = s + summary.length - 1;
  sheet.getRange(s + 7, 2, 1, 5).setFontWeight('bold');
  sheet.getRange(finalRow, 2, 1, 5).setFontWeight('bold').setFontSize(12);
  sheet.getRange(finalRow, 7).setValue(isInvoice ? '← 請求書に記載される金額' : '← 見積書に記載される金額').setFontColor(C.HINT).setFontSize(9);

  // 自動計算セルを誤って上書きしないよう警告付きで保護
  [L.customerName + ':G12', 'A' + L.itemStartRow + ':A' + lastItemRow, itemF, 'F' + s + ':F' + finalRow].forEach((a1) => {
    sheet.getRange(a1).protect().setDescription('Invoice Quick 自動計算セル（編集不要）').setWarningOnly(true);
  });
  return sheet;
}

/* =========================================================
 * 販売者向け：配布用テンプレートの準備（スクリプトエディタから手動実行）
 * ======================================================= */

/**
 * 販売者が note で配布する前に実行する関数（メニューには表示しない）。
 * 個人情報・テンプレートID・フォルダID・発行履歴を消去し、購入者が初期セットアップから始められる状態にする。
 */
function prepareForDistribution() {
  const ss = SpreadsheetApp.getActive();
  const personalKeys = [
    'issuerName', 'issuerPostal', 'issuerAddress', 'issuerTel', 'issuerEmail', 'registrationNumber',
    'bankName', 'bankBranch', 'bankNumber', 'bankHolder', 'mailSignature',
    'folderId', 'invoiceTemplateId', 'estimateTemplateId',
  ];
  const settingsSheet = ss.getSheetByName(IQ.SHEETS.SETTINGS);
  if (settingsSheet) {
    const rows = readSettingsMap_().rows;
    personalKeys.forEach((k) => {
      if (rows[k]) settingsSheet.getRange(rows[k], 3).clearContent();
    });
  }
  const history = ss.getSheetByName(IQ.SHEETS.HISTORY);
  if (history && history.getLastRow() > 1) {
    history.getRange(2, 1, history.getLastRow() - 1, IQ_HISTORY_HEADERS.length).clearContent();
  }
  const customers = ss.getSheetByName(IQ.SHEETS.CUSTOMERS);
  if (customers) writeCustomerSamples_(customers);
  if (settingsSheet && customers) rebuildInputSheets_(ss);
  const readme = ss.getSheetByName(IQ.SHEETS.README);
  if (readme) ss.setActiveSheet(readme);
  console.log('配布用の準備が完了しました。共有リンクの末尾を「/copy」にして購入者へ案内してください。');
}
