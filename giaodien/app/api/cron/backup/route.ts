import { getDb } from "@server/db";
import { createBackup } from "@server/backup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron gọi lúc 1h sáng (18:00 UTC) để sao lưu toàn bộ dữ liệu. Bảo vệ giống cron nhắc việc.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const fromVercel = /vercel-cron/i.test(req.headers.get("user-agent") ?? "");
  if (secret ? auth !== `Bearer ${secret}` : !fromVercel) return new Response("forbidden", { status: 403 });
  try {
    const db = await getDb();
    const meta = db.collection<{ _id: string; at: Date }>("meta");
    const prev = await meta.findOne({ _id: "cron:backup" });
    if (prev && prev.at.getTime() > Date.now() - 6 * 3600e3) return Response.json({ skipped: "đã chạy gần đây" });
    await meta.updateOne({ _id: "cron:backup" }, { $set: { at: new Date() } }, { upsert: true });
    const b = await createBackup("Tự động hằng ngày");
    return Response.json({ ok: true, id: b.id, bytes: b.bytes });
  } catch (e) {
    console.error("[cron backup]", (e as Error).message);
    return Response.json({ ok: false }, { status: 500 });
  }
}
