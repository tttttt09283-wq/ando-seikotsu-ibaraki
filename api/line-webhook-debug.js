// api/line-webhook-debug.js
// 【一時的な確認用】LINEグループのグループIDを確認するためのエンドポイント
// 使い方はチャットの案内を参照してください。
// グループIDが確認できたら、このファイルは削除して問題ありません。

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, info: "GET確認用。POSTでLINEからのWebhookを受け取ります。" });
  }

  try {
    const events = req.body?.events || [];
    events.forEach((e) => {
      console.log("=== LINE Webhook Event ===");
      console.log(JSON.stringify(e, null, 2));
      if (e.source?.groupId) {
        console.log("★★★ グループID:", e.source.groupId, "★★★");
      }
      if (e.source?.userId) {
        console.log("（送信者のuserId：", e.source.userId, "）");
      }
    });
  } catch (err) {
    console.error("webhook debug error:", err);
  }

  // LINEには200を返す必要があります
  res.status(200).json({ ok: true });
}
