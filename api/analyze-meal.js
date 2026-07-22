// Vercel Serverless Function: /api/analyze-meal
// 患者様がマイページからアップロードした食事写真をClaude APIで解析し、
// 料理内容とおおよその栄養価（カロリー・PFC・鉄/カルシウム/マグネシウム/ビタミンD/ビタミンB群/亜鉛/オメガ3/食物繊維）を推定して返す。
//
// 事前準備:
// Vercelプロジェクトの環境変数に ANTHROPIC_API_KEY を設定してください
// （Anthropic Console https://console.anthropic.com/ で発行したAPIキー。LINE用のトークンとは別物です）
//
// 注意：これは栄養価の「AIによる目安の推定」であり、医療的な診断や正確な栄養診断ではありません。
// マイページ側の表示にも参考情報である旨を明記しています。

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POSTのみ対応しています" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "サーバー側にANTHROPIC_API_KEYが設定されていません" });
    return;
  }

  const { imageBase64, mediaType } = req.body || {};
  if (!imageBase64) {
    res.status(400).json({ error: "imageBase64が空です" });
    return;
  }

  const prompt = `あなたは管理栄養士です。添付された食事の写真を見て、写っている料理・食材を推定し、およその栄養価を算出してください。

必ず次のJSON形式のみで回答してください（説明文や前置き、コードブロックの記号は一切不要です。JSONオブジェクトのみを出力してください）：

{
  "foods": "識別した料理・食材の説明（日本語、簡潔に）",
  "calories": 数値(kcal),
  "protein_g": 数値,
  "fat_g": 数値,
  "carbs_g": 数値,
  "iron_mg": 数値,
  "calcium_mg": 数値,
  "magnesium_mg": 数値,
  "vitamin_d_ug": 数値,
  "vitamin_b_mg": 数値,
  "zinc_mg": 数値,
  "omega3_g": 数値,
  "fiber_g": 数値
}

写真から判断できる範囲でのおおよその推定値で構いません。数値は全て0以上の数字（小数可）にしてください。食べ物が写っていない、または判別できない場合は foods に「認識できませんでした」と入れ、他の数値は全て0にしてください。`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: imageBase64 } },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      res.status(500).json({ error: (data.error && data.error.message) || "Claude APIでエラーが発生しました" });
      return;
    }

    const textBlock = (data.content || []).find((c) => c.type === "text");
    if (!textBlock) {
      res.status(500).json({ error: "解析結果が空でした" });
      return;
    }

    const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      res.status(500).json({ error: "解析結果の読み取りに失敗しました", raw: textBlock.text });
      return;
    }

    res.status(200).json({ result: parsed });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
}
