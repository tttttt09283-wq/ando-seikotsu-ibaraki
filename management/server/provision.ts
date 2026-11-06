import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { loginIdDomain } from "@/lib/supabase/env";
import { toAuthEmail } from "@/lib/login-id";
import { generateInitialPassword } from "@/lib/password";

// Supabase Auth のユーザー一覧（POSで使っているID）を、メールアドレス → ID の表にする
export async function authUsersByEmail(): Promise<Map<string, string>> {
  const admin = createAdminClient();
  const map = new Map<string, string>();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error("ログイン情報を確認できませんでした");
    for (const u of data.users) if (u.email) map.set(u.email.toLowerCase(), u.id);
    if (data.users.length < 200) break;
  }
  return map;
}

export type Provisioned = { authId: string; password: string | null; linkedExisting: boolean };

// ログインIDを用意する：POSですでに使っているIDならそのアカウント（PASSは任意で再発行）、無ければ新しく作る
export async function provisionLogin(loginId: string, name: string, opts: { reissueExisting: boolean; known?: Map<string, string> }): Promise<Provisioned> {
  const admin = createAdminClient();
  const email = toAuthEmail(loginId, loginIdDomain());
  const known = opts.known ?? (await authUsersByEmail());
  const existing = known.get(email) ?? null;
  if (existing) {
    if (!opts.reissueExisting) return { authId: existing, password: null, linkedExisting: true };
    const password = generateInitialPassword();
    const { error } = await admin.auth.admin.updateUserById(existing, { password });
    if (error) throw new Error("既存のアカウントのPASSを再発行できませんでした");
    return { authId: existing, password, linkedExisting: true };
  }
  const password = generateInitialPassword();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
  if (error || !data.user) throw new Error("ログインIDを発行できませんでした");
  known.set(email, data.user.id);
  return { authId: data.user.id, password, linkedExisting: false };
}

// 登録に失敗したとき、今回新しく作ったログインだけを取り消す（POSの既存アカウントは消さない）
export async function undoProvision(p: Provisioned) {
  if (!p.linkedExisting) await createAdminClient().auth.admin.deleteUser(p.authId).catch(() => {});
}
