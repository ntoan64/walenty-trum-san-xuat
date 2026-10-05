import { can } from "@core/permissions";
import { listAudit } from "@server/store";
import { currentUser, unauthorized, serverError } from "@/lib/session";

export const dynamic = "force-dynamic";

// Lịch sử thao tác. Quản lý kho / phó kho xem của mọi người; người khác chỉ xem của mình.
async function handle(req: Request) {
  const me = await currentUser();
  if (!me) return unauthorized();
  const url = new URL(req.url);
  const all = can(me.role, "audit.all");
  const userId = all ? url.searchParams.get("userId") || undefined : me.id;
  const d = (k: string) => { const v = url.searchParams.get(k); return v ? new Date(v) : undefined; };
  const rows = await listAudit({ userId, from: d("from"), to: d("to"), limit: 500 });
  return Response.json({ rows, all });
}

export async function GET(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    return serverError(e);
  }
}
