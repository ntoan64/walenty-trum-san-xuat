import { loadState, toClient } from "@server/store";
import { currentUser, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

// Toàn bộ dữ liệu cho người đang đăng nhập (đã bỏ hash mật khẩu)
export async function GET() {
  const me = await currentUser();
  if (!me) return unauthorized();
  const { state } = await loadState();
  return Response.json({ meId: me.id, state: toClient(state) });
}
