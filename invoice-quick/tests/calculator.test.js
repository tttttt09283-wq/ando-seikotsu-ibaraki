/**
 * calculator.test.js
 * 計算ロジック（src/Calculator.gs）と、関連する純粋関数（Utils / Validator）の検証。
 *
 * 実行方法（Node.js 18 以上）:
 *   node --test tests/calculator.test.js
 *
 * .gs ファイルを vm で読み込み、GAS と同じく全ファイルが同じグローバル空間を共有する形で検証します。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', 'src');

function loadGas(files) {
  const sandbox = { module: { exports: {} }, console: console, BigInt: BigInt };
  vm.createContext(sandbox);
  files.forEach((f) => {
    const code = fs.readFileSync(path.join(SRC, f), 'utf8');
    vm.runInContext(code, sandbox, { filename: f });
  });
  return sandbox.module.exports;
}

const G = loadGas(['Utils.gs', 'Calculator.gs', 'Config.gs', 'Validator.gs', 'Customer.gs']);
const MODES = ['切り捨て', '四捨五入', '切り上げ'];
/** vm 内で作られた配列・オブジェクトを、比較できる通常の値に変換 */
const plain = (v) => JSON.parse(JSON.stringify(v));

/* =========================================================
 * 0. すべての .gs ファイルが構文エラーなく読み込めること
 * ======================================================= */
test('全 .gs ファイルの構文チェック（GAS と同様に1つのグローバル空間へ読み込み）', () => {
  const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.gs'));
  assert.equal(files.length, 10);
  const sandbox = { module: { exports: {} }, console: console };
  vm.createContext(sandbox);
  files.forEach((f) => {
    assert.doesNotThrow(() => vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), sandbox, { filename: f }), f);
  });
  const manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'appsscript.json'), 'utf8'));
  assert.equal(manifest.runtimeVersion, 'V8');
});

/* =========================================================
 * 1. 端数処理モード・税率の正規化
 * ======================================================= */
test('normalizeRoundingMode: 日本語ラベル・空欄・不正値', () => {
  assert.equal(G.normalizeRoundingMode('切り捨て'), 'floor');
  assert.equal(G.normalizeRoundingMode('四捨五入'), 'round');
  assert.equal(G.normalizeRoundingMode('切り上げ'), 'ceil');
  assert.equal(G.normalizeRoundingMode(''), 'floor', '空欄は切り捨て');
  assert.equal(G.normalizeRoundingMode(null), 'floor');
  assert.equal(G.normalizeRoundingMode('ceil'), 'ceil');
  assert.equal(G.normalizeRoundingMode('五捨六入'), null);
});

test('normalizeTaxRate: さまざまな入力形式', () => {
  assert.equal(G.normalizeTaxRate(10), 10);
  assert.equal(G.normalizeTaxRate('8'), 8);
  assert.equal(G.normalizeTaxRate('10%'), 10);
  assert.equal(G.normalizeTaxRate('１０％'), 10);
  assert.equal(G.normalizeTaxRate(0.1), 10, 'パーセント書式のセル（0.1）');
  assert.equal(G.normalizeTaxRate(0.08), 8);
  assert.equal(G.normalizeTaxRate(0), 0);
  assert.equal(G.normalizeTaxRate('0'), 0);
  assert.equal(G.normalizeTaxRate(''), null);
  assert.equal(G.normalizeTaxRate(null), null);
  assert.ok(Number.isNaN(G.normalizeTaxRate(5)));
  assert.ok(Number.isNaN(G.normalizeTaxRate('abc')));
  assert.ok(Number.isNaN(G.normalizeTaxRate(-10)));
});

/* =========================================================
 * 2. divideAndRound（整数演算の丸め）
 * ======================================================= */
test('divideAndRound: 正負・境界値（0.5）', () => {
  const d = (n, den, m) => G.divideAndRound(BigInt(n), BigInt(den), m);
  assert.equal(d(12345, 10, 'floor'), 1234);
  assert.equal(d(12345, 10, 'round'), 1235);
  assert.equal(d(12345, 10, 'ceil'), 1235);
  assert.equal(d(12344, 10, 'round'), 1234);
  assert.equal(d(12340, 10, 'ceil'), 1234, '割り切れる場合は切り上げない');
  // マイナスは絶対値で処理
  assert.equal(d(-12345, 10, 'floor'), -1234);
  assert.equal(d(-12345, 10, 'round'), -1235);
  assert.equal(d(-12341, 10, 'ceil'), -1235);
  assert.equal(d(-4, 10, 'floor'), 0);
  assert.ok(!Object.is(d(-4, 10, 'floor'), -0), '-0 を返さない');
  assert.throws(() => d(1, 0, 'floor'));
});

/* =========================================================
 * 3. 明細金額（数量 × 単価）
 * ======================================================= */
test('calcLineAmount: 整数', () => {
  assert.equal(G.calcLineAmount(1, 50000, '切り捨て'), 50000);
  assert.equal(G.calcLineAmount(3, 12000, '切り上げ'), 36000);
  assert.equal(G.calcLineAmount(12, 0, '四捨五入'), 0);
});

test('calcLineAmount: 小数の端数処理（1.5 × 333 = 499.5）', () => {
  assert.equal(G.calcLineAmount(1.5, 333, '切り捨て'), 499);
  assert.equal(G.calcLineAmount(1.5, 333, '四捨五入'), 500);
  assert.equal(G.calcLineAmount(1.5, 333, '切り上げ'), 500);
});

test('calcLineAmount: 浮動小数点の罠を回避', () => {
  // JS では 0.07 * 100 = 7.000000000000001 → 素朴な Math.ceil だと 8 になってしまう
  assert.equal(0.07 * 100 === 7, false, '前提：JS の浮動小数点誤差');
  assert.equal(G.calcLineAmount(0.07, 100, '切り上げ'), 7);
  assert.equal(G.calcLineAmount(100, 0.07, '切り上げ'), 7);
  // 0.57 * 100 = 56.99999999999999 → 素朴な Math.floor だと 56 になってしまう
  assert.equal(G.calcLineAmount(0.57, 100, '切り捨て'), 57);
  assert.equal(G.calcLineAmount(1.15, 100, '切り捨て'), 115);
  // 1.1 * 3 = 3.3000000000000003
  assert.equal(G.calcLineAmount(1.1, 3, '切り捨て'), 3);
  assert.equal(G.calcLineAmount(1.1, 3, '切り上げ'), 4);
  // 文字単価（ライター案件）：1.2円 × 2,500文字 = 3,000円
  assert.equal(G.calcLineAmount(2500, 1.2, '切り上げ'), 3000);
  // 0.29 * 100 = 28.999999999999996
  assert.equal(G.calcLineAmount(0.29, 100, '切り捨て'), 29);
  // 時間単価 3,333円 × 2.25時間 = 7499.25
  assert.equal(G.calcLineAmount(2.25, 3333, '切り捨て'), 7499);
  assert.equal(G.calcLineAmount(2.25, 3333, '四捨五入'), 7499);
  assert.equal(G.calcLineAmount(2.25, 3333, '切り上げ'), 7500);
  // 小数4桁同士
  assert.equal(G.calcLineAmount(0.0001, 0.0001, '切り上げ'), 1);
  assert.equal(G.calcLineAmount(0.0001, 0.0001, '切り捨て'), 0);
});

test('calcLineAmount: 値引き（マイナス単価）', () => {
  assert.equal(G.calcLineAmount(1, -5000, '切り捨て'), -5000);
  assert.equal(G.calcLineAmount(1.5, -333, '切り捨て'), -499);
  assert.equal(G.calcLineAmount(1.5, -333, '切り上げ'), -500);
});

test('calcLineAmount: 大きな金額でも精度が落ちない', () => {
  assert.equal(G.calcLineAmount(1000000, 1000000000, '切り捨て'), 1e15);
  // (10^6 − 0.0001) × (10^9 − 0.0001) = 999,999,999,899,900.00000001
  assert.equal(G.calcLineAmount(999999.9999, 999999999.9999, '切り捨て'), 999999999899900);
  assert.equal(G.calcLineAmount(999999.9999, 999999999.9999, '四捨五入'), 999999999899900);
  assert.equal(G.calcLineAmount(999999.9999, 999999999.9999, '切り上げ'), 999999999899901);
});

/* =========================================================
 * 4. 消費税（税率ごとに1回の端数処理）
 * ======================================================= */
test('calcTax: 10% / 8% / 0%', () => {
  assert.equal(G.calcTax(12345, 10, '切り捨て'), 1234);
  assert.equal(G.calcTax(12345, 10, '四捨五入'), 1235);
  assert.equal(G.calcTax(12345, 10, '切り上げ'), 1235);
  assert.equal(G.calcTax(1234, 8, '切り捨て'), 98);   // 98.72
  assert.equal(G.calcTax(1234, 8, '四捨五入'), 99);
  assert.equal(G.calcTax(1234, 8, '切り上げ'), 99);
  assert.equal(G.calcTax(1250, 8, '切り上げ'), 100, '割り切れる (100.00)');
  assert.equal(G.calcTax(999999, 0, '切り上げ'), 0);
  assert.equal(G.calcTax(30, 10, '切り上げ'), 3, '30 × 0.1 の浮動小数点誤差を回避');
  assert.throws(() => G.calcTax(100.5, 10, '切り捨て'));
  assert.throws(() => G.calcTax(100, 5, '切り捨て'));
});

test('税率ごとに1回だけ端数処理する（明細ごとに丸めない）', () => {
  // 333円 × 3行（10%）：明細ごとに四捨五入すると 33×3=99円、正しくは 999×10% = 99.9 → 100円
  const items = [1, 2, 3].map((i) => ({ name: '作業' + i, quantity: 1, unitPrice: 333, taxRate: 10 }));
  const r = G.calculateDocument(items, { roundingMode: '四捨五入' });
  assert.equal(r.groups[10].base, 999);
  assert.equal(r.groups[10].tax, 100);
  assert.equal(r.total, 1099);
  const perLine = items.reduce((s) => s + Math.round(333 * 0.1), 0);
  assert.equal(perLine, 99, '比較：明細ごとの丸めは 99 円（誤り）');
});

/* =========================================================
 * 5. 書類全体の計算
 * ======================================================= */
test('calculateDocument: 10% と 8% の混在（適格請求書の税率別集計）', () => {
  const items = [
    { name: 'SNS運用代行（10月分）', quantity: 1, unitPrice: 55555, taxRate: 10 },
    { name: '撮影用お菓子', quantity: 3, unitPrice: 333, taxRate: 8 },
    { name: '印紙代（立替）', quantity: 1, unitPrice: 200, taxRate: 0 },
  ];
  const expected = {
    '切り捨て': { t10: 5555, t8: 79 },  // 5555.5 / 79.92
    '四捨五入': { t10: 5556, t8: 80 },
    '切り上げ': { t10: 5556, t8: 80 },
  };
  MODES.forEach((mode) => {
    const r = G.calculateDocument(items, { roundingMode: mode });
    assert.equal(r.groups[10].base, 55555, mode);
    assert.equal(r.groups[8].base, 999, mode);
    assert.equal(r.groups[0].base, 200, mode);
    assert.equal(r.groups[10].tax, expected[mode].t10, mode);
    assert.equal(r.groups[8].tax, expected[mode].t8, mode);
    assert.equal(r.groups[0].tax, 0, mode);
    assert.equal(r.subtotal, 56754, mode);
    assert.equal(r.taxTotal, expected[mode].t10 + expected[mode].t8, mode);
    assert.equal(r.total, 56754 + r.taxTotal, mode);
    assert.equal(r.withholding, 0);
    assert.equal(r.billingAmount, r.total);
    assert.equal(r.hasReducedRate, true);
    assert.deepEqual(plain(G.checkCalculationIntegrity(r)), [], mode);
  });
});

test('calculateDocument: 税率が空欄なら 10%、件数を集計', () => {
  const r = G.calculateDocument([
    { name: 'A', quantity: 1, unitPrice: 1000, taxRate: '' },
    { name: 'B', quantity: 1, unitPrice: 1000, taxRate: null },
    { name: 'C', quantity: 1, unitPrice: 1000, taxRate: '10%' },
  ], { roundingMode: '切り捨て' });
  assert.equal(r.groups[10].count, 3);
  assert.equal(r.groups[10].tax, 300);
  assert.equal(r.lines[0].taxRate, 10);
  assert.equal(r.hasReducedRate, false);
});

test('calculateDocument: 値引き行を含む', () => {
  const r = G.calculateDocument([
    { name: 'Webサイト制作', quantity: 1, unitPrice: 300000, taxRate: 10 },
    { name: '継続割引', quantity: 1, unitPrice: -30000, taxRate: 10 },
  ], { roundingMode: '切り捨て' });
  assert.equal(r.subtotal, 270000);
  assert.equal(r.taxTotal, 27000);
  assert.equal(r.total, 297000);
});

test('calculateDocument: 不正な端数処理・税率はエラー', () => {
  assert.throws(() => G.calculateDocument([], { roundingMode: '五捨六入' }));
  assert.throws(() => G.calculateDocument([{ quantity: 1, unitPrice: 1, taxRate: 5 }], { roundingMode: '切り捨て' }));
});

test('calculateDocument: 明細0件は全て0円', () => {
  const r = G.calculateDocument([], { roundingMode: '切り捨て' });
  assert.equal(r.total, 0);
  assert.deepEqual(plain(G.checkCalculationIntegrity(r)), []);
});

/* =========================================================
 * 6. 源泉徴収
 * ======================================================= */
test('calcWithholding: 100万円以下 / 超 / 端数切り捨て', () => {
  assert.equal(G.calcWithholding(0), 0);
  assert.equal(G.calcWithholding(-100), 0);
  assert.equal(G.calcWithholding(10000), 1021);
  assert.equal(G.calcWithholding(33333), 3403);        // 3403.2993 → 切り捨て
  assert.equal(G.calcWithholding(100000), 10210);
  assert.equal(G.calcWithholding(1000000), 102100);
  assert.equal(G.calcWithholding(1000001), 102100);    // 超過1円 × 20.42% = 0.2042 → 0
  assert.equal(G.calcWithholding(1500000), 204200);    // 500,000 × 20.42% + 102,100
  assert.equal(G.calcWithholding(2345678), 376887);    // 1,345,678 × 0.2042 = 274787.44 → +102,100
  assert.throws(() => G.calcWithholding(100.5));
});

test('calculateDocument: 源泉徴収あり（税抜の報酬額に対して計算）', () => {
  const r = G.calculateDocument([
    { name: 'デザイン料', quantity: 1, unitPrice: 100000, taxRate: 10 },
  ], { roundingMode: '切り捨て', withholding: true });
  assert.equal(r.total, 110000);
  assert.equal(r.withholding, 10210);
  assert.equal(r.billingAmount, 99790);
  assert.deepEqual(plain(G.checkCalculationIntegrity(r)), []);
});

/* =========================================================
 * 7. セルフチェック（改ざん・計算ミスの検出）
 * ======================================================= */
test('checkCalculationIntegrity: 不整合を検出する', () => {
  const r = G.calculateDocument([
    { name: 'A', quantity: 1, unitPrice: 1000, taxRate: 10 },
    { name: 'B', quantity: 1, unitPrice: 500, taxRate: 8 },
  ], { roundingMode: '切り捨て' });
  assert.deepEqual(plain(G.checkCalculationIntegrity(r)), []);
  const broken = JSON.parse(JSON.stringify(r));
  broken.groups[8].tax += 1;
  broken.taxTotal += 1;
  broken.total += 1;
  broken.billingAmount += 1;
  assert.ok(G.checkCalculationIntegrity(broken).length > 0);
  const broken2 = JSON.parse(JSON.stringify(r));
  broken2.lines[0].amount = 999;
  assert.ok(G.checkCalculationIntegrity(broken2).length > 0);
});

/* =========================================================
 * 8. ランダム検証：独立した参照実装と 3,000 ケース一致
 * ======================================================= */
test('ランダム検証：参照実装（別の丸め式）と全ケース一致', () => {
  let seed = 20261017;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  // 参照実装：数量は小数2桁、単価は整数。丸めは divideAndRound とは別の式で計算
  const refRound = (num, den, mode) => {
    const sign = num < 0n ? -1n : 1n;
    const a = num < 0n ? -num : num;
    let q;
    if (mode === '切り捨て') q = a / den;
    else if (mode === '切り上げ') q = (a + den - 1n) / den;
    else q = (a * 2n + den) / (2n * den);
    return Number(sign * q);
  };
  for (let n = 0; n < 3000; n++) {
    const mode = MODES[n % 3];
    const count = 1 + Math.floor(rand() * 20);
    const items = [];
    const bases = { 10: 0, 8: 0, 0: 0 };
    for (let i = 0; i < count; i++) {
      const q100 = 1 + Math.floor(rand() * 100000);           // 0.01〜1000.00
      const price = Math.floor(rand() * 2000000) - 100000;     // -100,000〜1,899,999
      const rate = [10, 8, 0][Math.floor(rand() * 3)];
      items.push({ name: 'x', quantity: q100 / 100, unitPrice: price, taxRate: rate });
      bases[rate] += refRound(BigInt(q100) * BigInt(price), 100n, mode);
    }
    const r = G.calculateDocument(items, { roundingMode: mode, withholding: n % 2 === 0 });
    const tax10 = refRound(BigInt(bases[10]) * 10n, 100n, mode);
    const tax8 = refRound(BigInt(bases[8]) * 8n, 100n, mode);
    const subtotal = bases[10] + bases[8] + bases[0];
    assert.equal(r.groups[10].base, bases[10]);
    assert.equal(r.groups[8].base, bases[8]);
    assert.equal(r.groups[0].base, bases[0]);
    assert.equal(r.groups[10].tax, tax10);
    assert.equal(r.groups[8].tax, tax8);
    assert.equal(r.subtotal, subtotal);
    assert.equal(r.total, subtotal + tax10 + tax8);
    if (n % 2 === 0 && subtotal > 0) {
      const ref = subtotal <= 1000000
        ? Math.floor((subtotal * 1021) / 10000)
        : Math.floor(((subtotal - 1000000) * 2042) / 10000) + 102100;
      assert.equal(r.withholding, ref);
    }
    assert.deepEqual(plain(G.checkCalculationIntegrity(r)), []);
  }
});

/* =========================================================
 * 9. 関連する純粋関数（Utils / Validator / Customer）
 * ======================================================= */
test('formatNumber / formatYen', () => {
  assert.equal(G.formatNumber(0), '0');
  assert.equal(G.formatNumber(1234567), '1,234,567');
  assert.equal(G.formatNumber(-30000), '-30,000');
  assert.equal(G.formatNumber(1.5), '1.5');
  assert.equal(G.formatNumber(1234.25), '1,234.25');
  assert.equal(G.formatYen(110000), '¥110,000');
  assert.equal(G.formatYen(-500), '-¥500');
});

test('toNumberOrNaN: 全角・カンマ・円記号', () => {
  assert.equal(G.toNumberOrNaN('1,500'), 1500);
  assert.equal(G.toNumberOrNaN('１５００'), 1500);
  assert.equal(G.toNumberOrNaN('¥1,500'), 1500);
  assert.equal(G.toNumberOrNaN('1500円'), 1500);
  assert.equal(G.toNumberOrNaN('－500'), -500);
  assert.equal(G.toNumberOrNaN(''), null);
  assert.equal(G.toNumberOrNaN(null), null);
  assert.ok(Number.isNaN(G.toNumberOrNaN('abc')));
  assert.ok(Number.isNaN(G.toNumberOrNaN('1.2.3')));
});

test('sanitizeFileName / buildPdfFileName: 危険文字の除去', () => {
  assert.equal(G.sanitizeFileName('A/B\\C:D*E?F"G<H>I|J'), 'A_B_C_D_E_F_G_H_I_J');
  assert.equal(G.sanitizeFileName('  ..株式会社　テスト..  '), '株式会社 テスト');
  assert.equal(G.sanitizeFileName('改行\nタブ\t'), '改行 タブ');
  assert.equal(G.sanitizeFileName(''), '無題');
  assert.equal(Array.from(G.sanitizeFileName('あ'.repeat(100), 40)).length, 40);
  assert.equal(
    G.buildPdfFileName('請求書', { y: 2026, m: 10, d: 7 }, '株式会社サンプル/商事', 'INV-202610-001'),
    '請求書_20261007_株式会社サンプル_商事_INV-202610-001.pdf');
});

test('日付：パース・期限計算', () => {
  assert.deepEqual(plain(G.dateToParts('2026/10/17')), { y: 2026, m: 10, d: 17 });
  assert.deepEqual(plain(G.dateToParts('２０２６年１月５日')), { y: 2026, m: 1, d: 5 });
  assert.equal(G.dateToParts('2026/02/30'), null);
  assert.equal(G.dateToParts('来週'), null);
  const p = { y: 2026, m: 1, d: 31 };
  assert.deepEqual(plain(G.computeDueDate(p, '翌月末')), { y: 2026, m: 2, d: 28 });
  assert.deepEqual(plain(G.computeDueDate(p, '当月末')), { y: 2026, m: 1, d: 31 });
  assert.deepEqual({ ...G.computeDueDate({ y: 2026, m: 12, d: 15 }, '翌々月末') }, { y: 2027, m: 2, d: 28 });
  assert.deepEqual({ ...G.computeDueDate({ y: 2026, m: 12, d: 15 }, '30日後') }, { y: 2027, m: 1, d: 14 });
  assert.equal(G.formatPartsJa({ y: 2026, m: 11, d: 30 }), '2026年11月30日');
});

test('extractDriveId: URL から ID を取り出す', () => {
  const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
  assert.equal(G.extractDriveId('https://drive.google.com/drive/folders/' + id + '?usp=sharing'), id);
  assert.equal(G.extractDriveId('https://docs.google.com/document/d/' + id + '/edit'), id);
  assert.equal(G.extractDriveId(id), id);
  assert.equal(G.extractDriveId(''), '');
});

test('validateItemRows: 修正すべきセルを案内する', () => {
  const rows = [
    { row: 18, name: 'デザイン制作', qty: 1, price: 50000, rate: 10, note: '' },
    { row: 19, name: '', qty: 2, price: 1000, rate: 10, note: '' },        // 品名なし
    { row: 20, name: '撮影', qty: 'abc', price: 1000, rate: 10, note: '' }, // 数量が文字
    { row: 21, name: '交通費', qty: 1, price: '', rate: 10, note: '' },     // 単価なし
    { row: 22, name: '資料', qty: 1.23456, price: 100, rate: 10, note: '' }, // 小数5桁
    { row: 23, name: '飲料', qty: 1, price: 100, rate: 5, note: '' },        // 税率不正
    { row: 24, name: '', qty: '', price: '', rate: 10, note: '' },           // 空行（無視）
    { row: 25, name: '値引き', qty: 1, price: '-1,000', rate: '', note: '' },// 税率空欄→10
  ];
  const r = G.validateItemRows(rows, '請求書入力');
  assert.equal(r.items.length, 2);
  assert.equal(r.items[1].unitPrice, -1000);
  assert.equal(r.items[1].taxRate, 10);
  const cells = r.errors.map((e) => e.cell);
  assert.deepEqual(plain(cells), ['B19', 'C20', 'D21', 'C22', 'E23']);
  assert.ok(r.errors[0].message.indexOf('明細2行目') === 0);
});

test('validateDocumentInput: 必須項目・日付の前後関係', () => {
  const def = { type: 'invoice', label: '請求書', sheetName: '請求書入力', numberLabel: '請求書番号', dueLabel: '支払期限' };
  const base = {
    number: 'INV-202610-001', issueDate: '2026/10/17', dueDate: '2026/11/30', customerId: 'C001',
    subject: '10月分', option: 'する', notes: '',
    items: [{ row: 18, name: '運用代行', qty: 1, price: 50000, rate: 10, note: '' }],
  };
  const ok = G.validateDocumentInput(base, def);
  assert.equal(ok.errors.length, 0);
  assert.equal(ok.parsed.withholding, true);

  const ng = G.validateDocumentInput(Object.assign({}, base, {
    number: '', dueDate: '2026/10/01', customerId: '', items: [],
  }), def);
  assert.deepEqual(plain(ng.errors.map((e) => e.cell)), ['C4', 'C6', 'C7', 'B18']);
});

test('validateSettings: 登録番号の形式チェック', () => {
  const def = { label: '請求書', templateKey: 'invoiceTemplateId' };
  const focus = (k) => ({ sheet: '初期設定', cell: k });
  const good = { issuerName: '山田', roundingMode: '切り捨て', registrationNumber: 'Ｔ１２３４-５６７８-９０１２３', invoiceTemplateId: 'x' };
  assert.equal(G.validateSettings(good, def, focus).length, 0);
  assert.equal(G.normalizeRegistrationNumber(good.registrationNumber), 'T1234567890123');
  const bad = { issuerName: '', roundingMode: 'x', registrationNumber: 'T123', invoiceTemplateId: '' };
  assert.deepEqual(plain(G.validateSettings(bad, def, focus).map((e) => e.cell)),
    ['issuerName', 'roundingMode', 'registrationNumber', 'invoiceTemplateId']);
});

test('buildRecipient: 担当者あり／なし／個人', () => {
  assert.deepEqual({ ...G.buildRecipient({ name: '株式会社A', contact: '佐藤 花子', honorific: '御中' }) },
    { line1: '株式会社A', line2: '佐藤 花子 様', salutation: '株式会社A\n佐藤 花子 様' });
  assert.equal(G.buildRecipient({ name: '株式会社B', contact: '', honorific: '' }).line1, '株式会社B 御中');
  assert.equal(G.buildRecipient({ name: '田中 一郎', contact: '', honorific: '様' }).line1, '田中 一郎 様');
  assert.equal(G.buildRecipient({ name: '株式会社C', contact: '鈴木様', honorific: '' }).line2, '鈴木 様');
});
