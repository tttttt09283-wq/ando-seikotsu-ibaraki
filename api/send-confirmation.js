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
    // マイページへのURL（予約確認・変更・回数券残高などが確認できる）
    const mypageUrl = `${BASE_URL}/mypage.html`;

    // LINEメッセージ（テキスト＋QRコードはLIFFのURLスキームで代替）
    const messages = [
      {
        type: "template",
        altText: `【あんど整骨院】ご予約確認 ${date} ${time}`,
        template: {
          type: "buttons",
          title: "✅ ご予約ありがとうございます",
          text: `${patientName} 様\n📅 ${date} ${time}\n\n来院時にQRを提示してください`,
          actions: [
            {
              type: "uri",
              label: "📋 マイページで予約を確認する",
              uri: mypageUrl
            }
          ]
        }
      }
    ];

    const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify({ to: userId, messages })
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
