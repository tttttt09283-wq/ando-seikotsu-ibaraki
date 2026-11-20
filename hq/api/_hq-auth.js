// 本部システムを使えるのは管理者（clinic_staff.role = 'admin'）だけ。院ID・個人PASSのログインは使えない
export function requireHq(staff, res) {
  if (staff.viaPin || staff.role !== "admin") {
    res.status(403).json({ error: "本部システムは管理者（社長・本部）のアカウントだけが使えます" });
    return false;
  }
  return true;
}
