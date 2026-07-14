// api/line-webhook-debug.js
// 【一時的な確認用】グループでメッセージを受け取ったら、
// そのグループのIDをそのままグループ内に返信します。
// グループIDが確認できたら、このファイルは削除して問題ありません。

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, info: "GET確認用。POSTでLINEからのWebhookを受け取ります。" });
  }

  try {
    const events = req.body?.events || [];

    for (const e of events) {
      console.log("=== LINE Webhook Event ===");
      console.log(JSON.stringify(e, null, 2));

      // グループ内でメッセージが送られてきたら、そのグループIDを返信する
      if (e.type === "message" && e.source?.groupId && e.replyToken) {
        const groupId = e.source.groupId;
        try {
          await fetch("https://api.line.me/v2/bot/message/reply", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
            },
            body: JSON.stringify({
              replyToken: e.replyToken,
              messages: [
                {
                  type: "text",
                  text: `🔧 このグループのIDは：\n${groupId}`,
                },
              ],
            }),
          });
        } catch (replyErr) {
          console.error("reply error:", replyErr);
        }
      }
    }
  } catch (err) {
    console.error("webhook debug error:", err);
  }

  // LINEには200を返す必要があります
  res.status(200).json({ ok: true });
}
