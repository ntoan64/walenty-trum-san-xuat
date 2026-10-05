import { cookies } from "next/headers";
import { createSession, findUserForLogin, SESSION_COOKIE, verifyPassword } from "@server/auth";
import { clearLimit, clientIp, LIMIT, rateLimit, retryAfter } from "@server/guard";
import { audit, loadState } from "@server/store";
import { bad, serverError } from "@/lib/session";

async function handle(req: Request) {
  const body = await req.json().catch(() => null);
  const login = String(body?.login ?? "").slice(0, 60), password = String(body?.password ?? "").slice(0, 100);
  if (!login || !password) return bad("Nhập tên đăng nhập và mật khẩu");

  // Chống dò mật khẩu: giới hạn theo IP và theo tên đăng nhập
  const ipKey = `login-ip:${clientIp(req)}`, userKey = `login-fail:${login.trim().toLowerCase()}`;
  if (!rateLimit(ipKey, LIMIT.loginPerIp, LIMIT.loginWindowMs)) {
    return Response.json({ error: `Thử quá nhiều lần, đợi ${Math.ceil(retryAfter(ipKey) / 60)} phút` }, { status: 429 });
  }
  const tooMany = () => Response.json({ error: `Sai quá ${LIMIT.loginFailsPerUser} lần, tài khoản tạm khóa ${Math.ceil(retryAfter(userKey) / 60)} phút` }, { status: 429 });

  await loadState(); // database trống thì tạo dữ liệu ban đầu
  const u = await findUserForLogin(login);
  if (!u || !(await verifyPassword(password, u.passwordHash))) {
    if (!rateLimit(userKey, LIMIT.loginFailsPerUser, LIMIT.loginWindowMs)) return tooMany();
    return Response.json({ error: "Sai tên đăng nhập hoặc mật khẩu." }, { status: 401 });
  }
  clearLimit(userKey);
  const { token, expiresAt } = await createSession(u.id);
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", expires: expiresAt });
  await audit({ userId: u.id, userName: u.name, action: "login", label: "Đăng nhập", detail: `Đăng nhập thành công (${clientIp(req)})` });
  return Response.json({ ok: true });
}

export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    return serverError(e);
  }
}
