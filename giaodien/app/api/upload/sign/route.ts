import { can } from "@core/permissions";
import { signUpload } from "@server/cloudinary";
import { rateLimit } from "@server/guard";
import { currentUser, forbidden, serverError, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

// Chữ ký 1 lần tải ảnh lỗi QC lên Cloudinary
export async function POST(req: Request) {
  try {
    const me = await currentUser();
    if (!me) return unauthorized();
    // ?folder=material: ảnh phụ liệu (quản lý kho); mặc định ảnh lỗi QC
    const folder = new URL(req.url).searchParams.get("folder") === "material" ? "material" : "qc";
    if (!can(me.role, folder === "material" ? "material.manage" : "qc.save")) return forbidden();
    if (!rateLimit(`upload:${me.id}`, 60, 60_000)) return Response.json({ error: "Tải ảnh quá nhiều, thử lại sau 1 phút" }, { status: 429 });
    const sig = signUpload(folder);
    if (!sig) return Response.json({ error: "Chưa cấu hình Cloudinary (CLOUDINARY_URL)" }, { status: 503 });
    return Response.json(sig);
  } catch (e) {
    return serverError(e);
  }
}
