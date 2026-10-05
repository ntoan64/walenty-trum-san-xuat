import { createLink, telegramEnabled, unlinkTelegram } from "@server/telegram";
import { audit } from "@server/store";
import { currentUser, serverError, unauthorized } from "@/lib/session";

// Tạo đường dẫn kết nối Telegram (mã dùng 1 lần, 15 phút)
export async function POST() {
  try {
    const me = await currentUser();
    if (!me) return unauthorized();
    if (!telegramEnabled()) return Response.json({ error: "Máy chủ chưa cấu hình Telegram (TELEGRAM_BOT_TOKEN)" }, { status: 400 });
    const url = await createLink(me.id);
    if (!url) return Response.json({ error: "Không liên lạc được với Telegram, thử lại sau" }, { status: 502 });
    return Response.json({ url });
  } catch (e) {
    return serverError(e);
  }
}

// Ngắt kết nối Telegram của chính mình
export async function DELETE() {
  try {
    const me = await currentUser();
    if (!me) return unauthorized();
    await unlinkTelegram(me.id);
    await audit({ userId: me.id, userName: me.name, action: "telegramUnlink", label: "Ngắt Telegram", detail: "Ngắt kết nối Telegram" });
    return Response.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
