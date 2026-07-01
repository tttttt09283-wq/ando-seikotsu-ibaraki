// api/send-confirmation.js
// 予約完了直後にLINEでQRコードを送信するAPI

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "https://ando-seikotsu-ibaraki.vercel.app";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { userId, bookingId, patientName, date, time } = req.body;

  if (!userId || !bookingId) {
    return res.status(400).json({ error: "userId and bookingId are required" });
  }

  try {
    // QRコードのURL（intake.htmlへのリンク）
    const qrTargetUrl = `${BASE_URL}/intake.html?id=${bookingId}`;

    // QRコード画像URL（Google Charts API）
    const qrImageUrl = `https://chart.googleapis.com/chart?chs=300x300&cht=qr&chl=${encodeURIComponent(qrTargetUrl)}&choe=UTF-8`;

    // LINEメッセージ（テキスト＋QRコード画像）
    const messages = [
      {
        type: "text",
        text: `✅ ご予約ありがとうございます！\n\nあんど整骨院 香里園駅前院\n\n📅 ${date} ${time}\n👤 ${patientName} 様\n\n来院時に下記のQRコードをスタッフにご提示ください。`
      },
      {
        type: "image",
        originalContentUrl: qrImageUrl,
        previewImageUrl: qrImageUrl
      }
    ];

    // LINE Messaging API でプッシュメッセージ送信
    const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        to: userId,
        messages: messages
      })
    });

    if (!lineRes.ok) {
      const errText = await lineRes.text();
      console.error("LINE API error:", errText);
      return res.status(500).json({ error: "LINE送信失敗", detail: errText });
    }

    return res.status(200).json({ success: true });

  } catch (e) {
    console.error("send-confirmation error:", e);
    return res.status(500).json({ error: e.message });
  }
}
