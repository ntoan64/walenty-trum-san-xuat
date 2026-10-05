import { findUserForLogin, hashPassword, validatePassword, verifyPassword } from "@server/auth";
import { audit } from "@server/store";
import { getDb } from "@server/db";
import { bodyTooLarge, LIMIT, rateLimit } from "@server/guard";
import { bad, currentUser, unauthorized, serverError } from "@/lib/session";

// Tự đổi mật khẩu của mình (phải nhập đúng mật khẩu hiện tại)
async function handle(req: Request) {
  const me = await currentUser();
  if (!me) return unauthorized();
  if (bodyTooLarge(req)) return bad("Dữ liệu gửi lên quá lớn");
  if (!rateLimit(`pw:${me.id}`, 10, LIMIT.loginWindowMs)) return Response.json({ error: "Thao tác quá nhiều lần, thử lại sau" }, { status: 429 });
  const b = await req.json().catch(() => null);
  const current = String(b?.current ?? ""), next = String(b?.next ?? "");
  const full = me.username ? await findUserForLogin(me.username) : null;
  if (!full || !(await verifyPassword(current, full.passwordHash))) return bad("Mật khẩu hiện tại không đúng");
  const err = validatePassword(next);
  if (err) return bad(err);
  const db = await getDb();
  await db.collection<{ _id: string }>("users").updateOne({ _id: me.id }, { $set: { passwordHash: await hashPassword(next) } });
  await audit({ userId: me.id, userName: me.name, action: "changePassword", label: "Đổi mật khẩu", detail: "Tự đổi mật khẩu" });
  return Response.json({ ok: true });
}

export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    return serverError(e);
  }
}
