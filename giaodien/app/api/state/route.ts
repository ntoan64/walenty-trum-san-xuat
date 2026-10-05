import { currentVersion, loadState, toClient } from "@server/store";
import { currentUser, serverError, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

// Dữ liệu cho người đang đăng nhập (đã bỏ hash mật khẩu).
// Gửi kèm ?v=<version đang có>: nếu chưa ai thay đổi gì thì chỉ trả { same: true } cho nhẹ.
async function handle(req: Request) {
  const me = await currentUser();
  if (!me) return unauthorized();
  const v = Number(new URL(req.url).searchParams.get("v"));
  if (v && v === (await currentVersion())) return Response.json({ same: true, meId: me.id });
  const { state, version } = await loadState();
  return Response.json({ meId: me.id, version, state: toClient(state) });
}

export async function GET(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    return serverError(e);
  }
}
