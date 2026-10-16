/** スプレッドシートのURLから ID とタブ番号を取り出す */

/** URL の #gid= / ?gid= （シートのタブ番号） */
export function extractGid(url: string): string | undefined {
  return /[#?&]gid=(\d+)/.exec(url)?.[1];
}

export function extractSpreadsheetId(urlOrId: string): string | null {
  const s = urlOrId.trim();
  const m = /\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/.exec(s);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(s) ? s : null;
}
