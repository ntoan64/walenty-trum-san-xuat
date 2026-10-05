import { can } from "@core/permissions";
import { hashPassword, validatePassword } from "@server/auth";
import { loadState, runAction, toClient } from "@server/store";
import { bodyTooLarge, LIMIT, rateLimit } from "@server/guard";
import { bad, currentUser, forbidden, unauthorized } from "@/lib/session";

// Admin đặt / cấp lại mật khẩu cho nhân viên
export async function POST(req: Request, ctx: RouteContext<"/api/users/[id]/password">) {
  const me = await currentUser();
  if (!me) return unauthorized();
  if (bodyTooLarge(req)) return bad("Dữ liệu gửi lên quá lớn");
  if (!rateLimit(`pw:${me.id}`, 10, LIMIT.loginWindowMs)) return Response.json({ error: "Thao tác quá nhiều lần, thử lại sau" }, { status: 429 });
  if (!can(me.role, "user.manage")) return forbidden();
  const { id } = await ctx.params;
  const b = await req.json().catch(() => null);
  const pw = String(b?.password ?? "");
  const pwErr = validatePassword(pw);
  if (pwErr) return bad(pwErr);
  const result = await runAction(me, "setPassword", [{ userId: id, passwordHash: await hashPassword(pw) }]);
  const { state } = await loadState();
  return Response.json({ result, state: toClient(state) });
}
