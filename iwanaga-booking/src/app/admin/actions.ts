"use server";

/**
 * 管理画面のサーバーアクション。すべて「ログイン中の管理者」と「権限」をサーバー側で確認する。
 * （サーバーアクションは誰でも POST できる入口なので、画面の表示制御だけに頼らない）
 */
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/admin/ActionForm";
import { getCurrentAdmin, LOCAL_ADMIN, localSessionSecret } from "@/lib/auth/admin";
import { AuthorizationError, type AdminContext } from "@/lib/auth/permissions";
import { LOCAL_SESSION_COOKIE, SESSION_TTL_SECONDS, safeEqualString, signSession } from "@/lib/auth/session";
import { authMode, config } from "@/lib/config";
import { rateLimit } from "@/lib/http";
import { getRepo } from "@/lib/repo";
import * as settings from "@/lib/services/admin-settings";
import * as svc from "@/lib/services/reservations";
import { supabaseServer } from "@/lib/supabase/server";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const n = (fd: FormData, k: string) => Number(fd.get(k) ?? NaN);

async function run(fn: (admin: AdminContext | null) => Promise<string>): Promise<ActionState> {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) return { ok: false, message: "ログインの有効期限が切れました。もう一度ログインしてください。" };
    const message = await fn(admin);
    revalidatePath("/admin", "layout");
    return { ok: true, message };
  } catch (e) {
    if (e instanceof svc.OperationError || e instanceof AuthorizationError) return { ok: false, message: e.message };
    console.error("admin action failed", e);
    return { ok: false, message: "エラーが発生しました。時間をおいて再度お試しください。" };
  }
}

function noticeText(n: { status: string; error?: string }) {
  if (n.status === "sent") return "LINEで通知しました。";
  if (n.status === "failed") return `LINEの送信に失敗しました（予約の状態はそのままです）。詳細画面から再送できます。${n.error ? `（${n.error}）` : ""}`;
  if (n.status === "manual_required") return "LINEが未連携のため自動送信できません。文面をコピーして公式LINEのトークから送信し、「手動送信済み」を記録してください。";
  return "";
}

// ---------------------------------------------------------------------
// ログイン・ログアウト
// ---------------------------------------------------------------------
export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const h = await headers();
  const ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!rateLimit(`login:${ip}`, 8, 15 * 60_000)) return { ok: false, message: "ログインの試行が多すぎます。しばらくしてからお試しください。" };

  if (authMode() === "local") {
    const pw = config.adminLocalPassword;
    if (!pw) return { ok: false, message: "ローカル代替モード：環境変数 ADMIN_LOCAL_PASSWORD を設定してください。" };
    if (!safeEqualString(s(fd, "password"), pw)) return { ok: false, message: "パスワードが違います。" };
    const store = await cookies();
    store.set(LOCAL_SESSION_COOKIE, signSession({ sub: LOCAL_ADMIN.id, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS }, localSessionSecret()), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
  } else {
    const sb = await supabaseServer();
    const { data, error } = await sb.auth.signInWithPassword({ email: s(fd, "email"), password: s(fd, "password") });
    if (error || !data.user) return { ok: false, message: "メールアドレスまたはパスワードが違います。" };
    const admin = await getRepo().getAdminUserByAuthId(data.user.id);
    if (!admin) {
      await sb.auth.signOut();
      return { ok: false, message: "このアカウントには管理画面の権限がありません。" };
    }
    await getRepo().addAudit({ actor_type: "admin", actor_id: admin.email, controller: null, location_id: null, reservation_id: null, action: "admin_login", from_status: null, to_status: null, detail: {} });
  }
  redirect("/admin");
}

export async function logoutAction() {
  if (authMode() === "local") (await cookies()).delete(LOCAL_SESSION_COOKIE);
  else await (await supabaseServer()).auth.signOut();
  redirect("/admin/login");
}

// ---------------------------------------------------------------------
// 予約の操作
// ---------------------------------------------------------------------
export async function confirmAction(_p: ActionState, fd: FormData) {
  return run(async (a) => {
    const r = await svc.confirmReservation(getRepo(), a, s(fd, "id"), n(fd, "version"), new Date());
    return `予約を確定しました。${noticeText(r.notice)}`;
  });
}
export async function proposeAction(_p: ActionState, fd: FormData) {
  return run(async (a) => {
    const r = await svc.proposeChange(getRepo(), a, s(fd, "id"), n(fd, "version"), s(fd, "date"), s(fd, "time"), new Date());
    return `日時変更を提案しました。${noticeText(r.notice)}`;
  });
}
export async function cancelAction(_p: ActionState, fd: FormData) {
  return run(async (a) => {
    const r = await svc.cancelReservation(getRepo(), a, s(fd, "id"), n(fd, "version"), s(fd, "reason"), fd.get("notify") === "on", new Date());
    return `キャンセルしました。${noticeText(r.notice)}`;
  });
}
export async function completeAction(_p: ActionState, fd: FormData) {
  return run(async (a) => {
    await svc.completeReservation(getRepo(), a, s(fd, "id"), n(fd, "version"), new Date());
    return "施術完了にしました。";
  });
}
export async function manualMatchAction(_p: ActionState, fd: FormData) {
  return run(async (a) => {
    await svc.manualLineMatch(getRepo(), a, s(fd, "id"), n(fd, "version"), s(fd, "note"), new Date());
    return "LINE受信を手動で照合しました（確認待ちになりました）。";
  });
}
export async function resendAction(_p: ActionState, fd: FormData) {
  return run(async (a) => noticeText(await svc.resendNotice(getRepo(), a, s(fd, "id"))) || "再送しました。");
}
export async function markManualAction(_p: ActionState, fd: FormData) {
  return run(async (a) => {
    await svc.markNoticeSentManually(getRepo(), a, s(fd, "id"));
    return "手動送信済みとして記録しました。";
  });
}
export async function deleteCustomerAction(_p: ActionState, fd: FormData) {
  return run(async (a) => {
    await svc.deleteCustomerData(getRepo(), a, s(fd, "customer_id"), new Date());
    return "顧客情報を削除（匿名化）しました。";
  });
}
export async function markNotificationsReadAction(_p: ActionState) {
  return run(async () => {
    await getRepo().markAdminNotificationsRead(new Date());
    return "既読にしました。";
  });
}

// ---------------------------------------------------------------------
// 設定
// ---------------------------------------------------------------------
const formObj = (fd: FormData) => Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));

export async function locationSettingsAction(_p: ActionState, fd: FormData) {
  return run(async (a) => {
    await settings.updateLocationSettings(getRepo(), a, s(fd, "location_id"), formObj(fd));
    return "受付設定を保存しました。";
  });
}
export async function locationTextsAction(_p: ActionState, fd: FormData) {
  return run(async (a) => {
    await settings.updateLocationTexts(getRepo(), a, s(fd, "location_id"), formObj(fd));
    return "表示内容を保存しました。";
  });
}
export async function openingReadyAction(_p: ActionState, fd: FormData) {
  return run(async (a) => {
    await settings.setOpeningReady(getRepo(), a, s(fd, "location_id"), s(fd, "value") === "true", s(fd, "note"));
    return "保存しました。";
  });
}
export async function companyApprovalAction(_p: ActionState, fd: FormData) {
  return run(async (a) => {
    await settings.setCompanyApproval(getRepo(), a, s(fd, "location_id"), s(fd, "value") === "true", s(fd, "note"), new Date());
    return "保存しました。";
  });
}
export async function bookingEnabledAction(_p: ActionState, fd: FormData) {
  return run(async (a) => {
    await settings.setBookingEnabled(getRepo(), a, s(fd, "location_id"), s(fd, "value") === "true");
    return s(fd, "value") === "true" ? "予約受付を開始しました。" : "予約受付を停止しました。";
  });
}
export async function addRuleAction(_p: ActionState, fd: FormData) {
  return run(async (a) => {
    await settings.addRule(getRepo(), a, s(fd, "location_id"), formObj(fd));
    return "追加しました。";
  });
}
export async function deleteRuleAction(_p: ActionState, fd: FormData) {
  return run(async (a) => {
    await settings.deleteRule(getRepo(), a, s(fd, "location_id"), s(fd, "rule_id"));
    return "削除しました。";
  });
}
export async function saveServiceAction(_p: ActionState, fd: FormData) {
  return run(async (a) => {
    await settings.saveService(getRepo(), a, s(fd, "location_id"), s(fd, "service_id") || null, formObj(fd));
    return "メニューを保存しました（料金・時間を変更した場合は再度の公開承認が必要です）。";
  });
}
export async function publishServiceAction(_p: ActionState, fd: FormData) {
  return run(async (a) => {
    await settings.publishService(getRepo(), a, s(fd, "service_id"), s(fd, "value") === "true", s(fd, "note"));
    return s(fd, "value") === "true" ? "公開しました。" : "非公開にしました。";
  });
}
export async function addBlockAction(_p: ActionState, fd: FormData) {
  return run(async (a) => {
    await settings.addBlock(getRepo(), a, formObj(fd));
    return "ブロックを追加しました。";
  });
}
export async function deleteBlockAction(_p: ActionState, fd: FormData) {
  return run(async (a) => {
    await settings.deleteBlock(getRepo(), a, s(fd, "block_id"));
    return "ブロックを削除しました。";
  });
}
