// Vercel Serverless Function: /api/send-reminders
// 「明日」来院予定で、LINE連携済み・まだリマインド未送信の予約を探して、
// 前日リマインドメッセージを一括送信する。Vercel Cron から毎日自動で呼び出される想定。
//
// 事前準備: Vercelの環境変数に LINE_CHANNEL_ACCESS_TOKEN が必要（他のLINE送信機能と共通）
//
// 手動でテストしたい場合は、ブラウザで下記URLを直接開くだけでも実行できます
// （GET/POSTどちらでも動作します）：
//   https://（あなたのVercelドメイン）/api/send-reminders

const SUPABASE_URL = "https://dctlirxcwitcupaewiyt.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjdGxpcnhjd2l0Y3VwYWV3aXl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzOTI1NTgsImV4cCI6MjA5Nzk2ODU1OH0.ym1WINmz3W7T2HWvtzWkQcKs96RB5JU1JZL7EiMz704";

// 「今日（JST）」の日付文字列を YYYY-MM-DD で返す
function jstDateStr(offsetDays) {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000 + (offsetDays || 0) * 24 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(jst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default async function handler(req, res) {
  const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!lineToken) {
    res.status(500).json({ error: "サーバー側にLINE_CHANNEL_ACCESS_TOKENが設定されていません" });
    return;
  }

  const tomorrowStr = jstDateStr(1);

  try {
    const filter =
      `?date=eq.${tomorrowStr}` +
      `&reminded=eq.false` +
      `&line_notify=eq.true` +
      `&cancelled=eq.false` +
      `&line_user_id=not.is.null`;

    const bookingsRes = await fetch(`${SUPABASE_URL}/rest/v1/bookings${filter}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    const bookings = await bookingsRes.json();
    if (!Array.isArray(bookings)) {
      res.status(500).json({ error: "予約データの取得に失敗しました", detail: bookings });
      return;
    }

    let success = 0;
    let failed = 0;
    const errors = [];

    for (const b of bookings) {
      const message =
        `🏥 ${b.patient_name}様\n\n` +
        `【ご予約前日のお知らせ】\n` +
        `明日 ${b.time} にご予約をお取りしております。\n\n` +
        `お会いできるのを楽しみにしております😊\n` +
        `※キャンセル・変更は当院までご連絡ください。`;

      try {
        const pushRes = await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${lineToken}` },
          body: JSON.stringify({ to: b.line_user_id, messages: [{ type: "text", text: message }] }),
        });

        if (pushRes.ok) {
          success++;
          await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${b.id}`, {
            method: "PATCH",
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ reminded: true }),
          });
        } else {
          failed++;
          const errText = await pushRes.text().catch(() => "");
          errors.push(`booking#${b.id}: HTTP ${pushRes.status} ${errText}`);
        }
      } catch (e) {
        failed++;
        errors.push(`booking#${b.id}: ${e.message || String(e)}`);
      }
    }

    res.status(200).json({
      target_date: tomorrowStr,
      total: bookings.length,
      success,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
}
