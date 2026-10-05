import { handleUpdate, telegramEnabled, webhookSecret } from "@server/telegram";

// Telegram gọi vào đây khi có người nhắn bot (vd bấm Start để kết nối tài khoản)
export async function POST(req: Request) {
  if (!telegramEnabled() || req.headers.get("x-telegram-bot-api-secret-token") !== webhookSecret()) {
    return new Response("forbidden", { status: 403 });
  }
  try {
    await handleUpdate(await req.json());
  } catch (e) {
    console.error("[telegram]", (e as Error).message);
  }
  return Response.json({ ok: true }); // luôn trả 200 để Telegram không gửi lặp
}
