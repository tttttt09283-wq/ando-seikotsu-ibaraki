/**
 * ===== デモモード（導入を検討している院向けのお試し） =====
 * /demo から始めると、このブラウザのタブの間だけデモモードになります。
 * デモモード中は、匿名統計を送らず、結果画面の予約ボタンの代わりに「導入について」の案内を出します。
 * （sessionStorage＝タブを閉じると消える保存場所）
 */
const DEMO_KEY = "ando-body-check:demo";
export const DEMO_EVENT = "ando-body-check:demo-change";

export function isDemo(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(DEMO_KEY) === "1";
  } catch {
    return false;
  }
}

export function setDemo(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (on) window.sessionStorage.setItem(DEMO_KEY, "1");
    else window.sessionStorage.removeItem(DEMO_KEY);
  } catch {
    // プライベートブラウズ等で保存できなくても、アプリは止めない
  }
  // 表示中の帯などに切り替わったことを知らせる
  window.dispatchEvent(new Event(DEMO_EVENT));
}
