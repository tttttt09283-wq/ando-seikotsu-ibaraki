/**
 * PdfGenerator.gs
 * Google ドキュメントのテンプレート作成、複製 → 差し込み → PDF 変換 → Drive 保存。
 *
 * ■ テンプレートの差し込み記号
 *  テンプレート内の「{{項目名}}」が実際の値に置き換わります。
 *  フォントや色、ロゴ画像の追加など、デザインは自由に変更できます（記号だけは残してください）。
 *  ・値が空のとき段落ごと消える項目：IQ_OPTIONAL_KEYS
 *  ・明細表：{{品名}} を含む行が明細の数だけ複製されます
 *  ・税率別の行：その税率の明細が無いとき行ごと消えます（{{内訳10_…}} など）
 */

const IQ_DOC_COLORS = Object.freeze({ NAVY: '#1F2D4D', TEXT: '#222222', SUB: '#666666', LIGHT: '#F3F5F9', BORDER: '#B7BDC7' });

/** 値が空のとき、記号を含む段落ごと削除する項目 */
const IQ_OPTIONAL_KEYS = Object.freeze([
  '宛先2', '顧客郵便番号', '顧客住所',
  '発行者郵便番号', '発行者住所', '発行者電話', '発行者メール', '登録番号',
  '件名', '軽減税率注記',
  '振込先見出し', '振込先', '見積条件見出し', '見積条件', '備考見出し', '備考',
]);

/** 改行を段落として展開する項目 */
const IQ_MULTILINE_KEYS = Object.freeze(['顧客住所', '発行者住所', '振込先', '見積条件', '備考']);

/* =========================================================
 * Drive フォルダ
 * ======================================================= */

function getOrCreateSubfolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  while (it.hasNext()) {
    const f = it.next();
    if (!f.isTrashed()) return f;
  }
  return parent.createFolder(name);
}

/** ID のフォルダが利用可能なら返す（ゴミ箱・アクセス不可は null） */
function tryGetFolder_(id) {
  if (!id) return null;
  try {
    const folder = DriveApp.getFolderById(id);
    return folder.isTrashed() ? null : folder;
  } catch (e) {
    return null;
  }
}

/** ID のファイルが Google ドキュメントとして利用可能なら返す */
function tryGetDocFile_(id) {
  if (!id) return null;
  try {
    const file = DriveApp.getFileById(id);
    if (file.isTrashed() || file.getMimeType() !== MimeType.GOOGLE_DOCS) return null;
    return file;
  } catch (e) {
    return null;
  }
}

/**
 * 保存先のルートフォルダ。設定が空欄・無効なら「Invoice Quick 発行書類」を作成して設定に保存する。
 * @param {boolean} allowCreate false の場合、無効な設定はエラーにする
 */
function ensureRootFolder_(settings, allowCreate) {
  const id = extractDriveId(settings.folderId);
  const folder = tryGetFolder_(id);
  if (folder) {
    if (id !== settings.folderId) setSetting('folderId', id);
    return folder;
  }
  if (id && !allowCreate) {
    throw userError('PDF保存先フォルダにアクセスできません。\n「初期設定」のPDF保存先フォルダIDが正しいか確認してください。\n（空欄にして「初期セットアップ」を実行すると、新しいフォルダを自動作成します）',
      settingFocus_('folderId', settings));
  }
  const created = DriveApp.createFolder(IQ.ROOT_FOLDER_NAME);
  setSetting('folderId', created.getId());
  settings.folderId = created.getId();
  return created;
}

/** 例：Invoice Quick 発行書類 / 請求書 / 2026年 */
function getOutputFolder_(settings, def, issueParts) {
  const root = ensureRootFolder_(settings, false);
  const typeFolder = getOrCreateSubfolder_(root, def.label);
  return getOrCreateSubfolder_(typeFolder, issueParts.y + '年');
}

/* =========================================================
 * テンプレート作成
 * ======================================================= */

function setParaStyle_(p, o) {
  const A = DocumentApp.Attribute;
  const attrs = {};
  attrs[A.FONT_SIZE] = o.size || 10;
  attrs[A.BOLD] = !!o.bold;
  attrs[A.FOREGROUND_COLOR] = o.color || IQ_DOC_COLORS.TEXT;
  p.setAttributes(attrs);
  p.setAlignment(o.align || DocumentApp.HorizontalAlignment.LEFT);
  p.setSpacingBefore(o.before || 0);
  p.setSpacingAfter(o.after == null ? 2 : o.after);
  p.setLineSpacing(o.line || 1.15);
  return p;
}

function addPara_(container, text, o) {
  return setParaStyle_(container.appendParagraph(text), o || {});
}

function styleCellsOfRow_(row, o, alignments) {
  for (let c = 0; c < row.getNumCells(); c++) {
    const cell = row.getCell(c);
    if (o.bg) cell.setBackgroundColor(o.bg);
    cell.setVerticalAlignment(DocumentApp.VerticalAlignment.CENTER);
    cell.setPaddingTop(3).setPaddingBottom(3).setPaddingLeft(5).setPaddingRight(5);
    const align = alignments ? alignments[c] : o.align;
    for (let i = 0; i < cell.getNumChildren(); i++) {
      const child = cell.getChild(i);
      if (child.getType() === DocumentApp.ElementType.PARAGRAPH) {
        setParaStyle_(child.asParagraph(), { size: o.size, bold: o.bold, color: o.color, align: align, after: 0 });
      }
    }
  }
}

/**
 * 請求書／見積書のテンプレート（Google ドキュメント）を作成する。
 * @param {string} type 'invoice' | 'estimate'
 * @param {GoogleAppsScript.Drive.Folder} folder 保存先
 * @return {string} ドキュメントID
 */
function createDocumentTemplate_(type, folder) {
  const isInvoice = type === 'invoice';
  const label = isInvoice ? '請求書' : '見積書';
  const numberKey = isInvoice ? '請求書番号' : '見積書番号';
  const H = DocumentApp.HorizontalAlignment;
  const W = 499; // A4 の本文幅（pt）

  const doc = DocumentApp.create('Invoice Quick ' + label + 'テンプレート');
  const body = doc.getBody();
  body.setPageWidth(595.28).setPageHeight(841.89)
    .setMarginTop(40).setMarginBottom(40).setMarginLeft(48).setMarginRight(48);

  // タイトル・番号・発行日
  const title = body.getParagraphs()[0];
  title.setText(isInvoice ? '請　求　書' : '御　見　積　書');
  setParaStyle_(title, { size: 22, bold: true, align: H.CENTER, after: 12, color: IQ_DOC_COLORS.NAVY });
  addPara_(body, numberKey + '：{{' + numberKey + '}}', { size: 9, align: H.RIGHT, after: 0 });
  addPara_(body, '発行日：{{発行日}}', { size: 9, align: H.RIGHT, after: 8 });

  // 宛先（左）・発行者（右）
  const party = body.appendTable([['{{宛先1}}', '{{発行者名}}']]);
  party.setBorderWidth(0);
  party.setColumnWidth(0, 290).setColumnWidth(1, W - 290);
  const left = party.getCell(0, 0);
  const right = party.getCell(0, 1);
  [left, right].forEach((c) => c.setPaddingLeft(0).setPaddingRight(0).setPaddingTop(0).setPaddingBottom(0));
  setParaStyle_(left.getChild(0).asParagraph(), { size: 14, bold: true, after: 2 });
  addPara_(left, '{{宛先2}}', { size: 11, after: 4 });
  addPara_(left, '〒{{顧客郵便番号}}', { size: 9, after: 0 });
  addPara_(left, '{{顧客住所}}', { size: 9, after: 10 });
  addPara_(left, isInvoice ? '下記のとおりご請求申し上げます。' : '下記のとおりお見積り申し上げます。', { size: 10, before: 6 });
  setParaStyle_(right.getChild(0).asParagraph(), { size: 11, bold: true, after: 2 });
  addPara_(right, '〒{{発行者郵便番号}}', { size: 9, after: 0 });
  addPara_(right, '{{発行者住所}}', { size: 9, after: 0 });
  addPara_(right, 'TEL：{{発行者電話}}', { size: 9, after: 0 });
  addPara_(right, '{{発行者メール}}', { size: 9, after: 0 });
  addPara_(right, '登録番号：{{登録番号}}', { size: 9, after: 0 });

  addPara_(body, '件名：{{件名}}', { size: 10, before: 10, after: 6 });

  // 金額ボックス
  const amount = body.appendTable([[isInvoice ? 'ご請求金額' : 'お見積金額（税込）', isInvoice ? '{{ご請求金額}}' : '{{見積金額}}']]);
  amount.setBorderColor(IQ_DOC_COLORS.NAVY).setBorderWidth(1);
  amount.setColumnWidth(0, 150).setColumnWidth(1, 230);
  styleCellsOfRow_(amount.getRow(0), { size: 11 }, [H.CENTER, H.RIGHT]);
  amount.getCell(0, 0).setBackgroundColor(IQ_DOC_COLORS.NAVY);
  setParaStyle_(amount.getCell(0, 0).getChild(0).asParagraph(), { size: 11, bold: true, color: '#FFFFFF', align: H.CENTER, after: 0 });
  setParaStyle_(amount.getCell(0, 1).getChild(0).asParagraph(), { size: 18, bold: true, align: H.RIGHT, after: 0 });

  addPara_(body, isInvoice ? 'お支払期限：{{支払期限}}' : '有効期限：{{有効期限}}', { size: 10, bold: true, before: 6, after: 10 });

  // 明細表（2行目が複製用の行）
  const items = body.appendTable([
    ['品名・内容', '数量', '単価', '税率', '金額'],
    ['{{品名}}', '{{数量}}', '{{単価}}', '{{税率}}', '{{金額}}'],
  ]);
  items.setBorderColor(IQ_DOC_COLORS.BORDER).setBorderWidth(0.5);
  [234, 55, 80, 45, 85].forEach((w, i) => items.setColumnWidth(i, w));
  styleCellsOfRow_(items.getRow(0), { bg: IQ_DOC_COLORS.NAVY, color: '#FFFFFF', bold: true, size: 9, align: H.CENTER });
  styleCellsOfRow_(items.getRow(1), { size: 9 }, [H.LEFT, H.RIGHT, H.RIGHT, H.CENTER, H.RIGHT]);
  addPara_(body, '{{軽減税率注記}}', { size: 8, color: IQ_DOC_COLORS.SUB, before: 2, after: 6 });

  // 合計表（該当する税率の行だけが残る）
  const totalRows = [
    ['小計（税抜）', '{{小計}}'],
    ['10%対象（税抜）', '{{内訳10_対象}}'],
    ['消費税（10%）', '{{内訳10_税}}'],
    ['8%対象（税抜）※軽減税率', '{{内訳8_対象}}'],
    ['消費税（8%）', '{{内訳8_税}}'],
    ['0%対象（非課税・不課税等）', '{{内訳0_対象}}'],
    ['消費税合計', '{{消費税合計}}'],
    ['合計（税込）', '{{合計}}'],
  ];
  if (isInvoice) {
    totalRows.push(['源泉徴収税額', '-{{源泉_税額}}']);
    totalRows.push(['差引ご請求金額', '{{源泉_差引}}']);
  }
  const totals = body.appendTable(totalRows);
  totals.setBorderColor(IQ_DOC_COLORS.BORDER).setBorderWidth(0.5);
  totals.setColumnWidth(0, W - 130).setColumnWidth(1, 130);
  for (let r = 0; r < totals.getNumRows(); r++) {
    const strong = ['合計（税込）', '差引ご請求金額'].indexOf(totalRows[r][0]) >= 0;
    styleCellsOfRow_(totals.getRow(r), { size: 9, bold: strong }, [H.RIGHT, H.RIGHT]);
    totals.getCell(r, 0).setBackgroundColor(IQ_DOC_COLORS.LIGHT);
  }

  // 振込先・見積条件・備考
  if (isInvoice) {
    addPara_(body, '{{振込先見出し}}', { size: 10, bold: true, before: 14, after: 2, color: IQ_DOC_COLORS.NAVY });
    addPara_(body, '{{振込先}}', { size: 10, after: 0 });
  } else {
    addPara_(body, '{{見積条件見出し}}', { size: 10, bold: true, before: 14, after: 2, color: IQ_DOC_COLORS.NAVY });
    addPara_(body, '{{見積条件}}', { size: 10, after: 0 });
  }
  addPara_(body, '{{備考見出し}}', { size: 10, bold: true, before: 12, after: 2, color: IQ_DOC_COLORS.NAVY });
  addPara_(body, '{{備考}}', { size: 9, after: 0 });

  doc.saveAndClose();
  const file = DriveApp.getFileById(doc.getId());
  if (folder) file.moveTo(folder);
  return doc.getId();
}

/* =========================================================
 * 差し込み処理
 * ======================================================= */

function placeholderPattern_(key) {
  return '\\{\\{' + String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\}\\}';
}

/** container 内の {{key}} をすべて value に置き換える（書式は記号の書式を引き継ぐ） */
function replacePlaceholderText_(container, key, value) {
  const pattern = placeholderPattern_(key);
  let found = container.findText(pattern);
  let guard = 0;
  while (found && guard++ < 300) {
    const text = found.getElement().asText();
    const start = found.getStartOffset();
    const end = found.getEndOffsetInclusive();
    if (value) text.insertText(end + 1, value);
    text.deleteText(start, end);
    found = container.findText(pattern);
  }
}

/** 要素を含む段落（Paragraph / ListItem 型にキャスト済み）を返す */
function getParagraphOf_(element) {
  let el = element;
  while (el) {
    const t = el.getType();
    if (t === DocumentApp.ElementType.PARAGRAPH) return el.asParagraph();
    if (t === DocumentApp.ElementType.LIST_ITEM) return el.asListItem();
    el = el.getParent();
  }
  return null;
}

/** 段落の親（本文・表のセル・ヘッダー/フッター）を insertParagraph が使える型にキャストする */
function castParagraphParent_(parent) {
  const T = DocumentApp.ElementType;
  switch (parent.getType()) {
    case T.BODY_SECTION: return parent.asBody();
    case T.TABLE_CELL: return parent.asTableCell();
    case T.HEADER_SECTION: return parent.asHeaderSection();
    case T.FOOTER_SECTION: return parent.asFooterSection();
    default: return null;
  }
}

/** 段落を削除する（セルや本文の最後の段落は削除できないため、その場合は空にする） */
function removeOrClearParagraph_(para) {
  const parent = para.getParent();
  if (parent && parent.getNumChildren() > 1) {
    try {
      para.removeFromParent();
      return;
    } catch (e) {
      // 最後の段落などは削除不可 → 空にする
    }
  }
  para.setText('');
}

function removeParagraphsWithPlaceholder_(body, key) {
  const pattern = placeholderPattern_(key);
  let found = body.findText(pattern);
  let guard = 0;
  while (found && guard++ < 50) {
    const para = getParagraphOf_(found.getElement());
    if (!para) break;
    removeOrClearParagraph_(para);
    found = body.findText(pattern);
  }
}

/** 改行を含む値を、段落を複製しながら差し込む */
function replaceMultiline_(body, key, value) {
  const lines = String(value).split('\n');
  if (lines.length <= 1) {
    replacePlaceholderText_(body, key, value);
    return;
  }
  const pattern = placeholderPattern_(key);
  let found = body.findText(pattern);
  let guard = 0;
  while (found && guard++ < 20) {
    const text = found.getElement().asText();
    const start = found.getStartOffset();
    const end = found.getEndOffsetInclusive();
    if (lines[0]) text.insertText(end + 1, lines[0]);
    text.deleteText(start, end);
    const para = getParagraphOf_(found.getElement());
    const parent = para ? castParagraphParent_(para.getParent()) : null;
    if (para && parent) {
      let index = parent.getChildIndex(para);
      for (let i = 1; i < lines.length; i++) {
        const copy = para.copy();
        copy.setText(lines[i]);
        index += 1;
        parent.insertParagraph(index, copy);
      }
    }
    found = body.findText(pattern);
  }
}

/** 条件付きの表の行を削除する（例：8%の明細が無ければ「8%対象」の行を削除） */
function removeConditionalRows_(body, rules) {
  const prefixes = Object.keys(rules).filter((p) => !rules[p]);
  if (prefixes.length === 0) return;
  body.getTables().forEach((table) => {
    for (let r = table.getNumRows() - 1; r >= 0; r--) {
      if (table.getNumRows() <= 1) break;
      const text = table.getRow(r).getText();
      if (prefixes.some((p) => text.indexOf('{{' + p) >= 0)) table.removeRow(r);
    }
  });
}

function findTableContaining_(body, marker) {
  const tables = body.getTables();
  for (let i = 0; i < tables.length; i++) {
    if (tables[i].getText().indexOf(marker) >= 0) return tables[i];
  }
  return null;
}

/** 明細表の複製用の行を、明細の数だけ複製して値を差し込む */
function fillItemsTable_(body, items) {
  const marker = '{{品名}}';
  const table = findTableContaining_(body, marker);
  if (!table) {
    throw userError('テンプレートに明細表（{{品名}} を含む表）が見つかりません。\nメニュー「⚙️ 設定・メンテナンス」→「書類テンプレートを再作成」を実行してください。');
  }
  let templateIndex = -1;
  for (let r = 0; r < table.getNumRows(); r++) {
    if (table.getRow(r).getText().indexOf(marker) >= 0) {
      templateIndex = r;
      break;
    }
  }
  const templateRow = table.getRow(templateIndex);
  let nameCol = 0;
  for (let c = 0; c < templateRow.getNumCells(); c++) {
    if (templateRow.getCell(c).getText().indexOf(marker) >= 0) nameCol = c;
  }
  items.forEach((item, i) => {
    const row = table.insertTableRow(templateIndex + 1 + i, templateRow.copy());
    replacePlaceholderText_(row, '品名', item.name);
    replacePlaceholderText_(row, '数量', item.quantity);
    replacePlaceholderText_(row, '単価', item.unitPrice);
    replacePlaceholderText_(row, '税率', item.taxRate);
    replacePlaceholderText_(row, '金額', item.amount);
    if (item.note) {
      const p = row.getCell(nameCol).appendParagraph(item.note);
      setParaStyle_(p, { size: 8, color: IQ_DOC_COLORS.SUB, after: 0 });
    }
  });
  table.removeRow(templateIndex);
}

/** 置き換えられずに残った {{…}} を空にし、名前の一覧を返す（自作テンプレートの記号ミス対策） */
function clearUnknownPlaceholders_(container) {
  const unknown = [];
  if (!container) return unknown;
  const pattern = '\\{\\{[^{}]{1,40}\\}\\}';
  let found = container.findText(pattern);
  let guard = 0;
  while (found && guard++ < 100) {
    const text = found.getElement().asText();
    const start = found.getStartOffset();
    const end = found.getEndOffsetInclusive();
    const name = text.getText().substring(start, end + 1);
    if (unknown.indexOf(name) < 0) unknown.push(name);
    text.deleteText(start, end);
    found = container.findText(pattern);
  }
  return unknown;
}

/**
 * テンプレートを複製して差し込み、PDF を保存する。
 * 途中で失敗しても一時ドキュメントは必ずゴミ箱へ移動する。
 * @param {{templateId:string, templateKey:string, folder:GoogleAppsScript.Drive.Folder, fileName:string,
 *          values:Object<string,string>, conditionalRows:Object<string,boolean>,
 *          items:Array<Object>, settings:Object, label:string}} job
 * @return {{fileId:string, url:string, name:string, warnings:string[]}}
 */
function generatePdf(job) {
  const template = tryGetDocFile_(extractDriveId(job.templateId));
  if (!template) {
    throw userError(job.label + 'テンプレートが見つかりません（削除された・ゴミ箱にある可能性があります）。\nメニュー「⚙️ 設定・メンテナンス」→「書類テンプレートを再作成」を実行してください。',
      settingFocus_(job.templateKey, job.settings));
  }
  let tempFile = null;
  try {
    tempFile = template.makeCopy('作成中_' + job.fileName.replace(/\.pdf$/, ''), job.folder);
    const doc = DocumentApp.openById(tempFile.getId());
    const body = doc.getBody();
    const values = job.values;

    removeConditionalRows_(body, job.conditionalRows || {});
    IQ_OPTIONAL_KEYS.forEach((k) => {
      if (Object.prototype.hasOwnProperty.call(values, k) && !values[k]) removeParagraphsWithPlaceholder_(body, k);
    });
    fillItemsTable_(body, job.items);
    Object.keys(values).forEach((k) => {
      const v = values[k] == null ? '' : String(values[k]);
      if (IQ_MULTILINE_KEYS.indexOf(k) >= 0) replaceMultiline_(body, k, v);
      else replacePlaceholderText_(body, k, v.replace(/\n+/g, ' '));
    });

    // ヘッダー・フッターに記号を置いた場合にも対応
    const sections = [doc.getHeader(), doc.getFooter()].filter((s) => s);
    sections.forEach((sec) => {
      Object.keys(values).forEach((k) => replacePlaceholderText_(sec, k, String(values[k] == null ? '' : values[k]).replace(/\n+/g, ' ')));
    });

    let unknown = clearUnknownPlaceholders_(body);
    sections.forEach((sec) => { unknown = unknown.concat(clearUnknownPlaceholders_(sec)); });
    doc.saveAndClose();

    const blob = tempFile.getAs(MimeType.PDF).setName(job.fileName);
    const pdfFile = job.folder.createFile(blob);
    const warnings = unknown.length
      ? ['テンプレート内の不明な差し込み記号 ' + unknown.join('、') + ' は空欄にしました。']
      : [];
    return { fileId: pdfFile.getId(), url: pdfFile.getUrl(), name: pdfFile.getName(), warnings: warnings };
  } finally {
    if (tempFile) {
      try {
        tempFile.setTrashed(true);
      } catch (e) {
        console.warn('[InvoiceQuick] 一時ドキュメントの削除に失敗しました');
      }
    }
  }
}
