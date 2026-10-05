import { after } from "next/server";
import { getDb } from "@server/db";
import { loadState, runAction } from "@server/store";
import { deliver } from "@server/telegram";
import type { User } from "@core";

export const dynamic = "force-dynamic";

// Vercel Cron gọi lúc 8h sáng (01:00 UTC) để gửi nhắc việc cho từng vai trò.
// Có CRON_SECRET thì bắt buộc khớp; không có thì chỉ nhận từ Vercel Cron, và tối đa 1 lần / 6 giờ.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const fromVercel = /vercel-cron/i.test(req.headers.get("user-agent") ?? "");
  if (secret ? auth !== `Bearer ${secret}` : !fromVercel) return new Response("forbidden", { status: 403 });
  try {
    // chống gửi lặp: mỗi 6 giờ chỉ chạy 1 lần
    const db = await getDb();
    const meta = db.collection<{ _id: string; at: Date }>("meta");
    const prev = await meta.findOne({ _id: "cron:remind" });
    if (prev && prev.at.getTime() > Date.now() - 6 * 3600e3) return Response.json({ skipped: "đã chạy gần đây" });
    await meta.updateOne({ _id: "cron:remind" }, { $set: { at: new Date() } }, { upsert: true });
    await loadState();
    const system = { id: "system", name: "Hệ thống", role: "quanly", active: true } as User;
    const r = await runAction(system, "sendReminders", [], (ns, users) => after(() => deliver(ns, users)));
    return Response.json({ ok: r.ok, msg: r.ok ? r.msg : r.error });
  } catch (e) {
    console.error("[cron]", (e as Error).message);
    return Response.json({ ok: false }, { status: 500 });
  }
}
