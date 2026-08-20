// Vercel Serverless Function: /api/send-confirmation
// 患者様が予約フォームで予約を確定した直後に呼び出され、LINEへ予約確認メッセージを送る。
//
// 事前準備: Vercelの環境変数に LINE_CHANNEL_ACCESS_TOKEN が必要（離反防止アラート等と共通）

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POSTのみ対応しています" });
    return;
  }

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    res.status(500).json({ error: "サーバー側にLINE_CHANNEL_ACCESS_TOKENが設定されていません" });
    return;
  }

  const { userId, patientName, date, time } = req.body || {};
  if (!userId) {
    res.status(400).json({ error: "userIdが空です" });
    return;
  }

  const message =
    `🏥 ${patientName || "お客"}様\n\n` +
    `ご予約ありがとうございます！以下の内容で承りました。\n\n` +
    `📅 ${date || ""} ${time || ""}\n\n` +
    `ご来院を心よりお待ちしております😊\n` +
    `※前日にもリマインドをお送りします。\n` +
    `キャンセル・変更は当院までご連絡ください。`;

  try {
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: userId,
        messages: [{ type: "text", text: message }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      res.status(500).json({ error: `LINE送信に失敗しました（HTTP ${response.status}）: ${errText}` });
      return;
    }

    res.status(200).json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
};
