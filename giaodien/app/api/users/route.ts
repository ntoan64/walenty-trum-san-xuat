import { can } from "@core/permissions";
import { hashPassword, validatePassword } from "@server/auth";
import { loadState, runAction, toClient } from "@server/store";
import { bodyTooLarge, LIMIT, rateLimit } from "@server/guard";
import { bad, currentUser, forbidden, unauthorized, serverError } from "@/lib/session";

// Admin cấp tài khoản mới (mật khẩu được băm ở đây, không lưu bản gốc)
async function handle(req: Request) {
  const me = await currentUser();
  if (!me) return unauthorized();
  if (bodyTooLarge(req)) return bad("Dữ liệu gửi lên quá lớn");
  if (!rateLimit(`pw:${me.id}`, 10, LIMIT.loginWindowMs)) return Response.json({ error: "Thao tác quá nhiều lần, thử lại sau" }, { status: 429 });
  if (!can(me.role, "user.manage")) return forbidden();
  const b = await req.json().catch(() => null);
  const pwErr = validatePassword(String(b?.password ?? ""));
  if (pwErr) return bad(pwErr);
  const result = await runAction(me, "createAccount", [{
    name: String(b?.name ?? ""), username: String(b?.username ?? ""), phone: String(b?.phone ?? ""),
    role: ["quanly", "kho", "qc"].includes(b?.role) ? b.role : "qc", title: String(b?.title ?? ""),
    passwordHash: await hashPassword(String(b.password)),
  }]);
  const { state } = await loadState();
  return Response.json({ result, state: toClient(state) });
}

export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    return serverError(e);
  }
}
