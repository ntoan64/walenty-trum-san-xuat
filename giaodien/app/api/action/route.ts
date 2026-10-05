import { bodyTooLarge, isDuplicate, LIMIT, rateLimit, retryAfter } from "@server/guard";
import { loadState, runAction, toClient } from "@server/store";
import { bad, currentUser, unauthorized, serverError } from "@/lib/session";

// Chạy 1 thao tác nghiệp vụ. Quyền kiểm tra ở server theo người đang đăng nhập.
async function handle(req: Request) {
  const me = await currentUser();
  if (!me) return unauthorized();
  if (bodyTooLarge(req)) return Response.json({ error: "Dữ liệu gửi lên quá lớn" }, { status: 413 });
  const key = `act:${me.id}`;
  if (!rateLimit(key, LIMIT.actionsPerMinute, 60_000)) {
    return Response.json({ error: `Thao tác quá nhanh, thử lại sau ${retryAfter(key)} giây` }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "");
  const args = Array.isArray(body?.args) ? body.args : [];
  if (["createAccount", "setPassword"].includes(name)) return bad("Dùng trang Nhân viên để cấp tài khoản");
  // Bấm 2 lần liền cùng một thao tác → chỉ chạy lần đầu
  if (isDuplicate(`${me.id}:${name}:${JSON.stringify(args)}`)) {
    return Response.json({ result: { ok: false, error: "Thao tác này vừa được gửi, đợi vài giây" } });
  }
  const result = await runAction(me, name, args);
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
