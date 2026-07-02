// api/send-confirmation.js
// 予約完了直後にLINEでQRコードを送信するAPI

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const BASE_URL = "https://ando-seikotsu-ibaraki.vercel.app";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { userId, bookingId, patientName, date, time } = req.body;

  if (!userId || !bookingId) {
    return res.status(400).json({ error: "userId and bookingId are required" });
  }

  try {
    // intake.htmlへのURL（スタッフが読み取る問診票）
    const intakeUrl = `${BASE_URL}/intake.html?id=${bookingId}`;
    // QRコード画像URL（自前API）
    const qrImageUrl = `${BASE_URL}/api/qr?url=${encodeURIComponent(intakeUrl)}`;
    // マイページURL
    const mypageUrl = `${BASE_URL}/mypage.html`;

    const messages = [
      // テキストメッセージ
      {
        type: "text",
        text: `✅ ご予約ありがとうございます！\n\nあんど整骨院 香里園駅前院\n\n📅 ${date} ${time}\n👤 ${patientName} 様\n\n来院時に下のQRコードをスタッフにご提示ください。`,
      },
      // QRコード画像
      {
        type: "image",
        originalContentUrl: qrImageUrl,
        previewImageUrl: qrImageUrl,
      },
      // マイページへのボタン
      {
        type: "template",
        altText: "マイページで予約確認・変更ができます",
        template: {
          type: "buttons",
          text: "マイページで予約確認・変更・回数券残高をご確認いただけます",
          actions: [
            {
              type: "uri",
              label: "📋 マイページを開く",
              uri: mypageUrl,
            },
          ],
        },
      },
    ];

    const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({ to: userId, messages }),
    });

    const lineData = await lineRes.json();

    if (!lineRes.ok) {
      console.error("LINE API error:", JSON.stringify(lineData));
      return res.status(500).json({ error: "LINE送信失敗", detail: lineData });
    }

    console.log("LINE送信成功:", userId, bookingId);
    return res.status(200).json({ success: true });

  } catch (e) {
    console.error("send-confirmation error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
