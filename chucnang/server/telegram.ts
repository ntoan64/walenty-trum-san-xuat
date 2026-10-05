// Gửi thông báo Telegram qua 1 bot chung (@WalentySanXuatBot); mỗi người tự kết nối bằng mã dùng 1 lần
import { createHash, randomBytes } from "node:crypto";
import { getDb } from "./db";
import type { Notification, User } from "../core/types";
import { ROLE_LABEL } from "../core/permissions";

const LINK_TTL_MIN = 15;

export const botToken = () => process.env.TELEGRAM_BOT_TOKEN ?? "";
export const telegramEnabled = () => !!botToken();

// Khóa bí mật cho webhook, tạo từ token → trên Vercel chỉ cần khai báo TELEGRAM_BOT_TOKEN
export const webhookSecret = () => createHash("sha256").update(`wts-webhook:${botToken()}`).digest("hex").slice(0, 48);

async function api<T = unknown>(method: string, body: unknown): Promise<{ ok: boolean; result?: T; description?: string }> {
  if (!telegramEnabled()) return { ok: false, description: "Chưa cấu hình TELEGRAM_BOT_TOKEN" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(`https://api.telegram.org/bot${botToken()}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal,
    });
    return await r.json();
  } catch (e) {
    return { ok: false, description: (e as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

export const sendTelegram = (chatId: string, text: string) =>
  api("sendMessage", { chat_id: chatId, text: text.slice(0, 4000), disable_web_page_preview: true });

let botName: string | null = null;
export async function botUsername() {
  if (botName) return botName;
  const r = await api<{ username: string }>("getMe", {});
  botName = r.ok && r.result ? r.result.username : null;
  return botName;
}

// Gửi các thông báo mới tới đúng người (theo danh sách người nhận hoặc theo vai trò), bỏ qua người tự soạn
export async function deliver(notifications: Notification[], users: User[]) {
  if (!telegramEnabled() || !notifications.length) return;
  const jobs: Promise<unknown>[] = [];
  for (const n of notifications) {
    const to = users.filter(u => u.active && u.telegramChatId && u.name !== n.from &&
      (n.users ? n.users.includes(u.id) : n.roles.includes(u.role)));
    const head = n.from ? `✉️ ${n.from} gửi:\n` : "";
    for (const u of to) jobs.push(sendTelegram(u.telegramChatId!, head + n.text));
  }
  await Promise.allSettled(jobs);
}

/* ---------- kết nối tài khoản ↔ Telegram ---------- */
type Link = { _id: string; userId: string; expiresAt: Date };

export async function createLink(userId: string) {
  const db = await getDb();
  const code = randomBytes(9).toString("base64url"); // 12 ký tự, dùng 1 lần
  await db.collection<Link>("tg_links").deleteMany({ userId });
  await db.collection<Link>("tg_links").insertOne({ _id: code, userId, expiresAt: new Date(Date.now() + LINK_TTL_MIN * 60_000) });
  const name = await botUsername();
  return name ? `https://t.me/${name}?start=${code}` : null;
}

async function setChatId(userId: string, chatId: string | null) {
  const db = await getDb();
  const users = db.collection<{ _id: string; telegramChatId?: string }>("users");
  if (chatId) {
    // 1 tài khoản Telegram chỉ gắn với 1 người
    await users.updateMany({ telegramChatId: chatId, _id: { $ne: userId } }, { $unset: { telegramChatId: "" } });
    await users.updateOne({ _id: userId }, { $set: { telegramChatId: chatId } });
  } else {
    await users.updateOne({ _id: userId }, { $unset: { telegramChatId: "" } });
  }
  // ghi thẳng vào users → tăng version để bộ nhớ đệm và các máy đang mở tải lại
  await db.collection<{ _id: string; version: number }>("meta").updateOne({ _id: "meta" }, { $inc: { version: 1 } });
}

export const unlinkTelegram = (userId: string) => setChatId(userId, null);

// Xử lý tin nhắn gửi tới bot (webhook)
export async function handleUpdate(update: { message?: { chat?: { id?: number }; text?: string } }) {
  const chatId = update.message?.chat?.id;
  const text = update.message?.text?.trim() ?? "";
  if (!chatId) return;
  const [cmd, code] = text.split(/\s+/);
  if (cmd !== "/start") {
    await sendTelegram(String(chatId), "Bot này chỉ gửi thông báo của Walenty Trùm Sản Xuất. Để kết nối: vào web → Thông tin tài khoản → Kết nối Telegram.");
    return;
  }
  if (!code) {
    await sendTelegram(String(chatId), "Chào bạn! Vào web Walenty → Thông tin tài khoản → bấm Kết nối Telegram để nhận thông báo.");
    return;
  }
  const db = await getDb();
  const link = await db.collection<Link>("tg_links").findOneAndDelete({ _id: code });
  if (!link || link.expiresAt < new Date()) {
    await sendTelegram(String(chatId), "Mã kết nối đã hết hạn hoặc đã dùng. Vào web bấm Kết nối Telegram lại nhé.");
    return;
  }
  const user = await db.collection<User & { _id: string }>("users").findOne({ _id: link.userId });
  if (!user || !user.active) return;
  await setChatId(link.userId, String(chatId));
  await sendTelegram(String(chatId), `✅ Đã kết nối với tài khoản ${user.name} (${user.title ?? ROLE_LABEL[user.role]}).\nTừ giờ bạn sẽ nhận thông báo của Walenty Trùm Sản Xuất ở đây.`);
}

export async function setWebhook(url: string) {
  return api("setWebhook", { url, secret_token: webhookSecret(), allowed_updates: ["message"], drop_pending_updates: true });
}
