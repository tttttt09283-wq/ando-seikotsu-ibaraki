// Excel（.xlsx）を読むための最小限の読み取り（追加パッケージなし）
// Googleドライブに Excel のままアップロードされたファイルは Sheets API で読めないので、中身をダウンロードしてここで読む。
//   readXlsx(buffer) → { sheetNames: [...], sheet(name, { maxRow, maxCol }) → 2次元配列（A1 が [0][0]） }
// 値：数値は number、文字は string、真偽は boolean、エラー（#DIV/0! など）は文字のまま。日付はシリアル値（数値）のまま。

import zlib from "node:zlib";

function unzip(buf) {
  // 末尾の「中央ディレクトリの終わり」を探す
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Excelファイルとして読めませんでした（zip の形式ではありません）");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString("utf8");
    files.set(name, { method, compSize, localOff });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return (name) => {
    const f = files.get(name);
    if (!f) return null;
    const lh = f.localOff;
    const start = lh + 30 + buf.readUInt16LE(lh + 26) + buf.readUInt16LE(lh + 28);
    const data = buf.slice(start, start + f.compSize);
    if (f.method === 0) return data.toString("utf8");
    if (f.method === 8) return zlib.inflateRawSync(data).toString("utf8");
    throw new Error(`対応していない圧縮形式です（${f.method}）`);
  };
}

const decode = (s) => String(s)
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&amp;/g, "&").replace(/\r\n?/g, "\n");
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`)); return m ? decode(m[1]) : null; };
// <si> や <is> の中の文字（<r><t>…</t></r> が複数でもつなげる。ふりがな <rPh> は除く）
const textOf = (xml) => {
  const body = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  const re = /<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g;
  let m;
  while ((m = re.exec(body))) out += m[1] ? decode(m[1]) : "";
  return out;
};
function colIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function readXlsx(buffer) {
  const get = unzip(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer));
  const wb = get("xl/workbook.xml");
  if (!wb) throw new Error("Excelファイルとして読めませんでした（workbook がありません）");
  const rels = get("xl/_rels/workbook.xml.rels") || "";
  const relMap = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) relMap[attr(m[0], "Id")] = attr(m[0], "Target");
  const sheets = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = attr(m[0], "name");
    const rid = attr(m[0], "r:id");
    let target = relMap[rid] || "";
    target = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    sheets.push({ name, path: target.replace(/\/\.\//g, "/") });
  }
  const sst = [];
  const ss = get("xl/sharedStrings.xml");
  if (ss) for (const m of ss.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) sst.push(textOf(m[1]));
  return {
    sheetNames: sheets.map((s) => s.name),
    sheet(name, opt = {}) {
      const s = sheets.find((x) => x.name === name);
      if (!s) return [];
      const xml = get(s.path);
      if (!xml) return [];
      const maxRow = opt.maxRow || Infinity, maxCol = opt.maxCol || Infinity;
      const rows = [];
      for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
        const r = Number(attr(rm[1], "r")) - 1;
        if (!(r >= 0) || r >= maxRow) continue;
        const row = [];
        for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
          const ref = attr(cm[1], "r");
          if (!ref) continue;
          const c = colIndex(ref);
          if (c >= maxCol) continue;
          const t = attr(cm[1], "t");
          const inner = cm[2] || "";
          const vm = inner.match(/<v>([\s\S]*?)<\/v>/);
          let v = null;
          if (t === "s") v = vm ? sst[Number(vm[1])] ?? "" : "";
          else if (t === "inlineStr") v = textOf(inner);
          else if (t === "str" || t === "e") v = vm ? decode(vm[1]) : "";
          else if (t === "b") v = vm ? vm[1] === "1" : null;
          else if (vm) { const n = Number(vm[1]); v = isFinite(n) ? n : decode(vm[1]); }
          if (v !== null && v !== "") row[c] = v;
        }
        rows[r] = Array.from({ length: row.length }, (_, i) => (row[i] === undefined ? "" : row[i]));
      }
      return Array.from({ length: rows.length }, (_, i) => rows[i] || []);
    },
  };
}
