import { can } from "@core/permissions";
import { getSheet, saveSheetChunk, sheetVersion, SHEET_KINDS, type SheetKind } from "@server/sapo";
import { audit } from "@server/store";
import { bad, currentUser, forbidden, serverError, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

const LABEL: Record<SheetKind, string> = { products: "Nhập file sản phẩm Sapo", purchase: "Nhập file đơn đặt hàng nhập Sapo" };
const kindOf = (x: unknown): SheetKind | null => (SHEET_KINDS.includes(x as SheetKind) ? (x as SheetKind) : null);
// bảng Sapo có giá → chỉ người quản lý sản phẩm và được xem giá
const allowed = (role: Parameters<typeof can>[0]) => can(role, "product.manage") && can(role, "price.view");

// Bảng Sapo (đúng như file). ?kind=products|purchase&v=<version đang có> → chưa đổi thì trả { same: true }
export async function GET(req: Request) {
  try {
    const me = await currentUser();
    if (!me) return unauthorized();
    if (!allowed(me.role)) return forbidden();
    const q = new URL(req.url).searchParams;
    const kind = kindOf(q.get("kind") ?? "products");
    if (!kind) return bad("Loại bảng không hợp lệ");
    const v = Number(q.get("v"));
    if (v && v === (await sheetVersion(kind))) return Response.json({ same: true });
    return Response.json({ sheet: await getSheet(kind) });
  } catch (e) {
    return serverError(e);
  }
}

// Tải bảng lên theo từng phần (giữ nguyên cột, giá trị)
export async function POST(req: Request) {
  try {
    const me = await currentUser();
    if (!me) return unauthorized();
    if (!allowed(me.role)) return forbidden();
    if (Number(req.headers.get("content-length") ?? 0) > 1_500_000) return bad("Phần gửi lên quá lớn");
    const b = await req.json().catch(() => null);
    const kind = kindOf(b?.kind ?? "products");
    if (!kind) return bad("Loại bảng không hợp lệ");
    const err = await saveSheetChunk(kind, { columns: b?.columns, rows: b?.rows, start: Number(b?.start), done: !!b?.done, fileName: String(b?.fileName ?? "") }, me.name);
    if (err) return bad(err);
    if (b?.done) await audit({ userId: me.id, userName: me.name, action: "sapoSheet", label: LABEL[kind], detail: `${String(b?.fileName ?? "")} · ${Number(b?.start) + (b?.rows?.length ?? 0)} dòng` });
    return Response.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
