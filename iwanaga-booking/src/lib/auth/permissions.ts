import type { AdminUser, ControllerId, Permission } from "../domain/types";

export type AdminContext = Pick<AdminUser, "id" | "email" | "display_name" | "role" | "allowed_controllers" | "can_export">;

const ROLE_PERMISSIONS: Record<AdminUser["role"], Permission[]> = {
  owner: ["view", "operate", "settings", "approve_gates", "audit", "export"],
  staff: ["view", "operate", "export"],
};

export class AuthorizationError extends Error {
  constructor(message = "この操作の権限がありません") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function hasPermission(admin: AdminContext, perm: Permission, controller?: ControllerId | null): boolean {
  if (!ROLE_PERMISSIONS[admin.role]?.includes(perm)) return false;
  if (perm === "export" && !admin.can_export) return false;
  if (controller && !admin.allowed_controllers.includes(controller)) return false;
  return true;
}

export function assertPermission(admin: AdminContext | null, perm: Permission, controller?: ControllerId | null): asserts admin is AdminContext {
  if (!admin) throw new AuthorizationError("ログインが必要です");
  if (!hasPermission(admin, perm, controller)) throw new AuthorizationError();
}
