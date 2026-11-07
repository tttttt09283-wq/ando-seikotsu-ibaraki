import { Badge } from "@/components/ui/badge";
import { REQUEST_STATUS, type RequestStatus } from "@/lib/leave/requests";

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const s = REQUEST_STATUS[status];
  return <Badge tone={s.tone}>{s.text}</Badge>;
}
