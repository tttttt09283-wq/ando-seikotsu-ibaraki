// Vercel Serverless Function: /api/send-line-push
// 離反防止アラートなどから、複数のLINEユーザーへ一斉にpushメッセージを送信する。
//
// 事前準備:
// 1. Vercelプロジェクトの環境変数に LINE_CHANNEL_ACCESS_TOKEN を設定してください
//    （LINE Official Account Manager > Messaging API設定 で発行したチャネルアクセストークン[長期]）
// 2. この api/ フォルダをプロジェクトルート（他の.htmlファイルと同じ階層）に置いてデプロイしてください
//
// LINEのpush APIは1回のリクエストにつき1ユーザーのみ（multicastは500人まで一括可能）。
// 今回はシンプルに multicast エンドポイントを使い、150人ずつに分割して送信する
// （multicastの上限は1回500人までだが、安全のため小分けにしている）。

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POSTのみ対応しています" });
    return;
  }

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    res.status(500).json({ error: "サーバー側にLINE_CHANNEL_ACCESS_TOKENが設定されていません" });
    return;
  }

  const { userIds, message } = req.body || {};
  if (!Array.isArray(userIds) || userIds.length === 0) {
    res.status(400).json({ error: "userIdsが空です" });
    return;
  }
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "messageが空です" });
    return;
  }

  // 150人ずつのチャンクに分割（multicast上限500人に対して余裕を持たせる）
  const chunkSize = 150;
  const chunks = [];
  for (let i = 0; i < userIds.length; i += chunkSize) {
    chunks.push(userIds.slice(i, i + chunkSize));
  }

  let successCount = 0;
  let failedCount = 0;
  const errors = [];

  for (const chunk of chunks) {
    try {
      const response = await fetch("https://api.line.me/v2/bot/message/multicast", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          to: chunk,
          messages: [{ type: "text", text: message }],
        }),
      });

      if (response.ok) {
        successCount += chunk.length;
      } else {
        const errText = await response.text().catch(() => "");
        failedCount += chunk.length;
        errors.push(`HTTP ${response.status}: ${errText}`);
      }
    } catch (e) {
      failedCount += chunk.length;
      errors.push(e.message || String(e));
    }
  }

  res.status(200).json({
    success: successCount,
    failed: failedCount,
    errors: errors.length > 0 ? errors : undefined,
  });
}
