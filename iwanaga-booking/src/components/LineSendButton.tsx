"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

/**
 * 「LINEで送信する」ボタン。
 * スマホではそのまま LINE アプリを開く。パソコンのブラウザでは LINE アプリが開けず
 * LINE のトップページに飛ばされてしまうため、スマホで読み取る QR コードを表示する。
 */
export default function LineSendButton({ url }: { url: string }) {
  const [mobile, setMobile] = useState<boolean | null>(null);
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    const isMobile = /iPhone|iPad|iPod|Android|Mobile|Line\//i.test(navigator.userAgent);
    setMobile(isMobile);
    if (!isMobile) {
      QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "L" })
        .then(setSvg)
        .catch(() => setSvg(null));
    }
  }, [url]);

  if (mobile === false) {
    return (
      <div className="mt-3 border border-line p-4 text-center">
        <p className="text-sm font-medium">スマホのカメラかLINEで、このQRコードを読み取ってください</p>
        <p className="mt-1 text-xs text-mist">LINEが開いて内容が入力されるので、そのまま「送信」を押してください。</p>
        {svg ? (
          <div className="mx-auto mt-3 w-72 max-w-full" aria-label="LINEで送信するためのQRコード" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <p className="mt-3 text-xs text-mist">QRコードを作成しています…</p>
        )}
      </div>
    );
  }

  return (
    <a href={url} className="mt-3 block bg-[#06C755] px-5 py-4 text-center text-sm font-bold tracking-[0.12em] text-white">
      LINEで送信する
    </a>
  );
}
