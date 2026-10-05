// Bảng Sapo lưu NGUYÊN như file Excel (đúng tiêu đề, đúng thứ tự cột, đúng giá trị).
// Mỗi loại file (sản phẩm, đơn đặt hàng nhập) là một bảng riêng.
// Tách khỏi dữ liệu nghiệp vụ để không làm nặng lần đồng bộ 5 giây.
import { getDb } from "./db";

export type SapoCell = string | number | null;
export type SheetKind = "products" | "purchase";
export const SHEET_KINDS: SheetKind[] = ["products", "purchase"];
const ROWS: Record<SheetKind, string> = { products: "sapo_rows", purchase: "sapo_purchase_rows" };
const META_ID: Record<SheetKind, string> = { products: "sapo", purchase: "purchase" };
type Meta = { _id: string; columns: string[]; fileName: string; importedAt: Date; by: string; count: number; version: number; pending?: number };
type Row = { _id: number; v: SapoCell[] };

const MAX_COLS = 80, MAX_ROWS = 20_000;

const cleanRow = (r: unknown, n: number): SapoCell[] =>
  Array.from({ length: n }, (_, i) => {
    const x = Array.isArray(r) ? r[i] : null;
    if (typeof x === "number" && isFinite(x)) return x;
    if (typeof x === "string") return x.slice(0, 2000);
    return null;
  });

// Gửi theo từng phần: phần đầu (start=0) xóa bảng cũ, phần cuối (done) chốt version mới
export async function saveSheetChunk(kind: SheetKind, a: { columns: string[]; rows: unknown[]; start: number; done: boolean; fileName: string }, by: string) {
  if (!Array.isArray(a.columns) || !a.columns.length || a.columns.length > MAX_COLS) return "Tiêu đề cột không hợp lệ";
  if (!Array.isArray(a.rows) || a.rows.length > 1000) return "Mỗi phần tối đa 1000 dòng";
  if (!Number.isInteger(a.start) || a.start < 0 || a.start + a.rows.length > MAX_ROWS) return "File quá lớn";
  const columns = a.columns.map(c => String(c ?? "").slice(0, 120));
  const db = await getDb();
  const rows = db.collection<Row>(ROWS[kind]);
  const meta = db.collection<Meta>("sapo_meta");
  if (a.start === 0) {
    await rows.deleteMany({});
    await meta.updateOne({ _id: META_ID[kind] }, { $set: { pending: 0 } }, { upsert: true });
  }
  if (a.rows.length) {
    await rows.bulkWrite(a.rows.map((r, i) => ({
      replaceOne: { filter: { _id: a.start + i }, replacement: { v: cleanRow(r, columns.length) }, upsert: true },
    })), { ordered: false });
  }
  if (a.done) {
    const prev = await meta.findOne({ _id: META_ID[kind] });
    await meta.updateOne({ _id: META_ID[kind] }, {
      $set: { columns, fileName: String(a.fileName ?? "").slice(0, 200), importedAt: new Date(), by, count: a.start + a.rows.length, version: (prev?.version ?? 0) + 1 },
      $unset: { pending: "" },
    }, { upsert: true });
  }
  return null;
}

export async function sheetVersion(kind: SheetKind) {
  const db = await getDb();
  return (await db.collection<Meta>("sapo_meta").findOne({ _id: META_ID[kind] }, { projection: { version: 1 } }))?.version ?? 0;
}

export async function getSheet(kind: SheetKind) {
  const db = await getDb();
  const meta = await db.collection<Meta>("sapo_meta").findOne({ _id: META_ID[kind] });
  if (!meta?.columns) return null;
  const rows = await db.collection<Row>(ROWS[kind]).find().sort({ _id: 1 }).toArray();
  return {
    columns: meta.columns, fileName: meta.fileName, importedAt: meta.importedAt, by: meta.by, version: meta.version,
    rows: rows.map(r => r.v),
  };
}
