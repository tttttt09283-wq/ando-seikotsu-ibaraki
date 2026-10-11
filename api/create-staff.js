// Vercel Serverless Function: /api/create-staff
// 管理画面の「+ スタッフ追加」から呼び出され、Supabase Authのログインアカウントを
// メール確認不要（即ログイン可能）な状態で作成する。
//
// ブラウザ側の匿名キー(anon key)ではユーザー作成APIを呼べない（セキュリティ上の制限）ため、
// このサーバー関数だけがservice_role キーを使ってAuthアカウントを作成する。
//
// 事前準備:
// Vercelの環境変数に SUPABASE_SERVICE_ROLE_KEY を追加してください。
// Supabaseダッシュボード → Settings → API → 「service_role」キー（secretと書かれている方。anonキーとは別物）
// ※ このキーは絶対にブラウザ側のコードに書かないでください。このファイル（サーバー関数）だけで使います。

const SUPABASE_URL = "https://dctlirxcwitcupaewiyt.supabase.co";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POSTのみ対応しています" });
    return;
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    res.status(500).json({ error: "サーバー側にSUPABASE_SERVICE_ROLE_KEYが設定されていません" });
    return;
  }

  // ===== 呼び出した人が「ログイン中の管理者」かを確認する =====
  // （以前は誰でもこのAPIを呼べたため、部外者がログインアカウントを作れてしまっていた）
  const authHeader = req.headers.authorization || "";
  const callerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!callerToken) {
    res.status(401).json({ error: "管理者としてログインしてから操作してください" });
    return;
  }
  try {
    const isAdmin = await verifyAdmin(callerToken, serviceKey);
    if (!isAdmin) {
      res.status(403).json({ error: "スタッフの追加は管理者のみ可能です" });
      return;
    }
  } catch (e) {
    res.status(401).json({ error: "ログイン情報を確認できませんでした。ログインし直してください" });
    return;
  }

  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ error: "email・passwordが必要です" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "パスワードは6文字以上にしてください" });
    return;
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });

    const data = await response.json();
    if (!response.ok) {
      res.status(response.status).json({ error: data.msg || data.error_description || data.message || "アカウント作成に失敗しました" });
      return;
    }

    res.status(200).json({ authUid: data.id, email: data.email });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
}

// ログイン中ユーザーのトークンから本人を特定し、clinic_staff で role='admin' かを確認する
async function verifyAdmin(callerToken, serviceKey) {
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${callerToken}` },
  });
  if (!userRes.ok) throw new Error("invalid token");
  const user = await userRes.json();
  if (!user || !user.id) throw new Error("invalid token");
  const staffRes = await fetch(
    `${SUPABASE_URL}/rest/v1/clinic_staff?auth_uid=eq.${encodeURIComponent(user.id)}&role=eq.admin&select=id`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  if (!staffRes.ok) throw new Error("lookup failed");
  const rows = await staffRes.json();
  return Array.isArray(rows) && rows.length > 0;
}
