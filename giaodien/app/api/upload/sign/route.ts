import { can } from "@core/permissions";
import { signUpload } from "@server/cloudinary";
import { rateLimit } from "@server/guard";
import { currentUser, forbidden, serverError, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

// Chữ ký 1 lần tải ảnh lỗi QC lên Cloudinary
export async function POST() {
  try {
    const me = await currentUser();
    if (!me) return unauthorized();
    if (!can(me.role, "qc.save")) return forbidden();
    if (!rateLimit(`upload:${me.id}`, 60, 60_000)) return Response.json({ error: "Tải ảnh quá nhiều, thử lại sau 1 phút" }, { status: 429 });
    const sig = signUpload("qc");
    if (!sig) return Response.json({ error: "Chưa cấu hình Cloudinary (CLOUDINARY_URL)" }, { status: 503 });
    return Response.json(sig);
  } catch (e) {
    return serverError(e);
  }
}
