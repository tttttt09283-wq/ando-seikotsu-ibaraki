// api/qr.js
// QRコード画像を生成して返すAPI
// 使い方: /api/qr?url=https://...

import QRCode from 'qrcode';

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'url parameter is required' });
  }

  try {
    // QRコードをPNG Buffer として生成
    const buffer = await QRCode.toBuffer(url, {
      type: 'png',
      width: 300,
      margin: 2,
      color: {
        dark: '#1e3a5f',  // あんど整骨院のブランドカラー
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 1日キャッシュ
    res.status(200).send(buffer);
  } catch (e) {
    console.error('QR generation error:', e);
    res.status(500).json({ error: e.message });
  }
}
