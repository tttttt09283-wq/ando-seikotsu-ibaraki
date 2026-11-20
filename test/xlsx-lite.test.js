// node --test test/*.test.js で実行（架空のデータ）
import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { readXlsx } from "../lib/xlsx-lite.js";

// 最小限の zip を作る（読み取り側は CRC を見ないので 0 のまま）
function makeZip(files) {
  const locals = [], centrals = [];
  let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, "utf8");
    const data = zlib.deflateRawSync(raw);
    const nm = Buffer.from(name, "utf8");
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nm.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, nm, data); centrals.push(ch, nm);
    off += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}

test("xlsx-lite：共有文字列・数値・数式の文字・エラー・空のセルを読み、列と行を絞れる", () => {
  const buf = makeZip({
    "xl/workbook.xml": `<workbook><sheets><sheet name="R8.10" sheetId="1" r:id="rId1"/><sheet name="原本" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>`,
    "xl/sharedStrings.xml": `<sst><si><t>出勤日数</t></si><si><r><t>固定</t></r><r><t xml:space="preserve">\r\n残業数</t></r></si><si><t>架空　太郎</t><rPh><t>カクウ</t></rPh></si></sst>`,
    "xl/worksheets/sheet1.xml": `<worksheet><sheetData>
      <row r="1"><c r="B1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c><c r="D1" t="str"><f>A1</f><v>A&amp;B</v></c></row>
      <row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3"><v>20.5</v></c><c r="C3" t="e"><v>#DIV/0!</v></c><c r="Z3"><v>999999</v></c></row>
      <row r="200"><c r="A200"><v>1</v></c></row>
    </sheetData></worksheet>`,
    "xl/worksheets/sheet2.xml": `<worksheet><sheetData/></worksheet>`,
  });
  const x = readXlsx(buf);
  assert.deepEqual(x.sheetNames, ["R8.10", "原本"]);
  const rows = x.sheet("R8.10", { maxRow: 150, maxCol: 16 });
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], ["", "出勤日数", "固定\n残業数", "A&B"]);
  assert.deepEqual(rows[1], []);
  assert.deepEqual(rows[2], ["架空　太郎", 20.5, "#DIV/0!"]); // Z列（16列目より右）は読まない・ふりがなは入れない
  assert.deepEqual(x.sheet("ない"), []);
  assert.throws(() => readXlsx(Buffer.from("not a zip")), /zip/);
});
