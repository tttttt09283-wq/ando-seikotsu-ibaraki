import { AlertTriangle, Ban, Clock, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { daysBetween, type IsoDate } from "@/lib/dates";

export const TASK_STATUS_LABELS = {
  open: "未対応",
  done: "対応済み",
  on_hold: "保留",
  not_applicable: "対象外",
} as const;
export type TaskStatus = keyof typeof TASK_STATUS_LABELS;

export const CLOSE_REASON_LABELS: Record<string, string> = {
  manual: "手動で対象外",
  condition_resolved: "条件解消（再来店・予約登録など）",
  contact_not_allowed: "配信停止・連絡不可",
  customer_deleted: "顧客削除",
};

export const CONTACT_STATUS_LABELS = {
  unknown: "同意未確認",
  allowed: "連絡可",
  not_allowed: "連絡不可",
  unsubscribed: "配信停止",
} as const;
export type ContactStatus = keyof typeof CONTACT_STATUS_LABELS;

export const CHANNEL_LABELS: Record<string, string> = {
  phone: "電話",
  line_manual: "LINE（手動送信）",
  email_manual: "メール（手動送信）",
  sms_manual: "SMS（手動送信）",
  in_person: "来店時に対面",
  other: "その他",
};

export const OUTCOME_LABELS: Record<string, string> = {
  reached: "つながった",
  no_answer: "不在・応答なし",
  sent: "送信した",
  replied: "返信あり",
  appointment_reported: "予約あり（本人確認）",
  declined: "辞退・不要",
  other: "その他",
};

export const PRIORITY_LABELS = { high: "高", normal: "中", low: "低" } as const;

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const variant = status === "done" ? "success" : status === "on_hold" ? "muted" : status === "not_applicable" ? "outline" : "default";
  return <Badge variant={variant}>{TASK_STATUS_LABELS[status]}</Badge>;
}

/** 期限の表示（色だけに頼らずテキストを併記） */
export function DueBadge({ dueOn, today, status }: { dueOn: IsoDate; today: IsoDate; status: TaskStatus }) {
  if (status !== "open") return null;
  const diff = daysBetween(today, dueOn);
  if (diff < 0) {
    return (
      <Badge variant="danger">
        <AlertTriangle className="size-3" aria-hidden />
        期限切れ {-diff}日
      </Badge>
    );
  }
  if (diff === 0) {
    return (
      <Badge variant="navy">
        <Clock className="size-3" aria-hidden />
        今日
      </Badge>
    );
  }
  return <Badge variant="muted">あと{diff}日</Badge>;
}

export function PriorityMark({ priority }: { priority: keyof typeof PRIORITY_LABELS }) {
  if (priority !== "high") return null;
  return (
    <span className="inline-flex items-center text-warning" title="優先度：高">
      <Star className="size-4 fill-current" aria-hidden />
      <span className="sr-only">優先度 高</span>
    </span>
  );
}

export function ContactStatusBadge({ status }: { status: ContactStatus }) {
  if (status === "allowed") return <Badge variant="success">{CONTACT_STATUS_LABELS.allowed}</Badge>;
  if (status === "unknown") return <Badge variant="warning">{CONTACT_STATUS_LABELS.unknown}</Badge>;
  return (
    <Badge variant="danger">
      <Ban className="size-3" aria-hidden />
      {CONTACT_STATUS_LABELS[status]}
    </Badge>
  );
}

export function AppointmentText({ nextAt, timeZone = "Asia/Tokyo" }: { nextAt: string | null; timeZone?: string }) {
  if (!nextAt) return <span className="text-warning">予約未確認</span>;
  return (
    <span>
      {new Intl.DateTimeFormat("ja-JP", { timeZone, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(
        new Date(nextAt),
      )}
    </span>
  );
}
