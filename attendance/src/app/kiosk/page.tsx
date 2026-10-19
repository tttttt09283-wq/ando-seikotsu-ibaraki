import { Kiosk } from "./Kiosk";

/**
 * 共用端末（キオスク）モード。
 * 管理画面へのリンク・管理画面のセッションは一切使わない。端末は本部発行の登録コードで有効化する。
 */
export const metadata = { title: "打刻端末 | あんど整骨院グループ" };

export default function KioskPage() {
  return <Kiosk />;
}
