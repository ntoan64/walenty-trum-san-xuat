import { can } from "@core/permissions";
import { createBackup, downloadUrl, listBackups } from "@server/backup";
import { rateLimit } from "@server/guard";
import { audit } from "@server/store";
import { bad, currentUser, forbidden, serverError, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Danh sách bản sao lưu (chỉ admin). ?id=<public_id> → chuyển tới link tải riêng tư 10 phút.
export async function GET(req: Request) {
  try {
    const me = await currentUser();
    if (!me) return unauthorized();
    if (!can(me.role, "user.manage")) return forbidden();
    const id = new URL(req.url).searchParams.get("id");
    if (id) {
      const url = downloadUrl(id);
      if (!url) return bad("Bản sao lưu không hợp lệ");
      await audit({ userId: me.id, userName: me.name, action: "backupDownload", label: "Tải bản sao lưu", detail: id.split("/").pop() ?? id });
      return Response.redirect(url, 302);
    }
    return Response.json({ list: await listBackups() });
  } catch (e) {
    return serverError(e);
  }
}

// Sao lưu ngay
export async function POST() {
  try {
    const me = await currentUser();
    if (!me) return unauthorized();
    if (!can(me.role, "user.manage")) return forbidden();
    if (!rateLimit(`backup:${me.id}`, 3, 10 * 60_000)) return Response.json({ error: "Vừa sao lưu rồi, thử lại sau ít phút" }, { status: 429 });
    const b = await createBackup(`Bấm tay · ${me.name}`);
    await audit({ userId: me.id, userName: me.name, action: "backup", label: "Sao lưu dữ liệu", detail: `${b.id.split("/").pop()} · ${Math.round(b.bytes / 1024)} KB` });
    return Response.json({ ok: true, id: b.id });
  } catch (e) {
    return serverError(e);
  }
}
