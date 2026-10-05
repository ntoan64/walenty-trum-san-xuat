import { loadState, toClient } from "@server/store";
import { currentUser, unauthorized, serverError } from "@/lib/session";

export const dynamic = "force-dynamic";

// Toàn bộ dữ liệu cho người đang đăng nhập (đã bỏ hash mật khẩu)
async function handle() {
  const me = await currentUser();
  if (!me) return unauthorized();
  const { state } = await loadState();
  return Response.json({ meId: me.id, state: toClient(state) });
}

export async function GET() {
  try {
    return await handle();
  } catch (e) {
    return serverError(e);
  }
}
