// Thao tác nghiệp vụ, chạy ở cả trình duyệt (kiểm tra trước) và server (ghi MongoDB).
// Mỗi hàm nhận bản nháp state (đã clone) và sửa trực tiếp; trả lỗi thì bản nháp bị bỏ.
import {
  applyImport, applyIssue, byId, calcBalance, canClose, DAY, REPAIR_DUE_DAYS,
  MATERIAL_CATEGORIES, MATERIAL_STATUS, nextMaterialCode, okLevel, isLive, PRODUCT_STATUS, needFor, shortages, unitCost, unusableMaterials, sizeProgress, validateDefectLines, validateQC, validateRequc,
  type BomLine, type DefectLine, type EventType, type SizeQty, type ItemStatus, type Material, type MaterialCategory, type ProductionOrder, type ProductVariant, type Role, type Action,
} from "./index";
import type { DataState } from "./state";
import { buildReminders } from "./reminders";
import { fmtD, nf, vnd } from "./format";

/* ---------- ràng buộc chống nhập sai / phá kho ---------- */
export const LIMITS = {
  importQty: 1_000_000, // số lượng 1 dòng nhập
  price: 1_000_000_000, // đơn giá
  lines: 50, // số dòng 1 phiếu / 1 lần QC
  photos: 4, // ảnh / 1 dòng lỗi
  orderQty: 100_000, // tổng 1 lệnh
  sizes: 20,
  dueDays: 365, // hạn tối đa
  bomQty: 1_000, // định mức / 1 sản phẩm
  bomLines: 30,
  labor: 100_000_000,
  minStock: 1_000_000,
  name: 120, // độ dài tên
  text: 1_000, // nội dung thông báo, mô tả
};
const tooLong = (v: string | undefined, n: number) => (v ?? "").trim().length > n;

export type Result = { ok: true; msg: string; id?: string } | { ok: false; error: string };
const ok = (msg: string, id?: string): Result => ({ ok: true, msg, id });
const fail = (error: string): Result => ({ ok: false, error });

export interface Ctx {
  s: DataState;
  me: string;
  meId?: string;
  now: Date;
}

const uid = (c: Ctx, p: string) => `${p}${c.s.seq.id++}`;
const tick = (c: Ctx) => new Date(c.now.getTime() + c.s.seq.id); // giữ thứ tự khi nhiều việc cùng lúc
const isInt = (n: number) => Number.isInteger(n);

export const wsName = (s: DataState, id: string) => byId(s.workshops, id)?.name ?? "";
export const prodOf = (s: DataState, o: ProductionOrder) => byId(s.products, o.product)!;
export const repairsOf = (s: DataState, o: ProductionOrder) => s.repairs.filter(r => r.order === o.id);

function notify(c: Ctx, roles: Role[], text: string) {
  c.s.notifications.unshift({ id: uid(c, "n"), roles, text, sentAt: tick(c), ok: true });
}
function event(c: Ctx, type: EventType, o: ProductionOrder, qty: number, round = 1) {
  if (qty > 0) c.s.events.push({ id: uid(c, "e"), type, order: o.id, workshop: o.workshop, product: o.product, qty, round, by: c.me, at: tick(c) });
}
function addFinished(c: Ctx, o: ProductionOrder, qty: number, repair?: string) {
  if (qty > 0) c.s.finishedTxns.push({ id: uid(c, "f"), product: o.product, qty, order: o.code, repair, by: c.me, at: tick(c) });
}
// Chống spam: dưới ngưỡng báo hết → báo 1 lần; nhập lên tới ngưỡng báo đủ → báo đã đủ và mở lại cảnh báo
function checkLow(c: Ctx, m: Material) {
  if (m.status !== "active") return;
  if (m.stock < m.minStock && !m.lowAlertedAt) {
    m.lowAlertedAt = c.now;
    notify(c, ["kho", "quanly"], `⚠️ ${m.code} (${m.name}) còn ${nf(m.stock, 1)} ${m.unit}, dưới ngưỡng báo hết ${nf(m.minStock)} ${m.unit}.\nCần nhập thêm.`);
  } else if (m.lowAlertedAt && m.stock >= okLevel(m)) {
    m.lowAlertedAt = null;
    notify(c, ["kho", "quanly"], `✅ ${m.code} (${m.name}) đã đủ hàng: ${nf(m.stock, 1)} ${m.unit} (ngưỡng báo đủ ${nf(okLevel(m))}).`);
  }
}
function getOrder(c: Ctx, id: string) {
  const o = byId(c.s.orders, id);
  return o?.cancelled ? undefined : o; // lệnh đã hủy không thao tác được nữa
}

/* ---------- kho phụ liệu ---------- */
export function importMaterial(c: Ctx, a: { materialId: string; qty: number; price: number; supplier: string }): Result {
  const m = byId(c.s.materials, a.materialId);
  if (!m) return fail("Không tìm thấy phụ liệu");
  if (m.status === "discontinued") return fail(`${m.code} đã ngừng dùng, không nhập thêm được`);
  if (!(a.qty > 0)) return fail("Số lượng phải lớn hơn 0");
  if (a.qty > LIMITS.importQty) return fail(`Số lượng 1 dòng tối đa ${nf(LIMITS.importQty)}`);
  if (a.price > LIMITS.price) return fail(`Đơn giá tối đa ${vnd(LIMITS.price)}`);
  if (tooLong(a.supplier, LIMITS.name)) return fail("Tên nhà cung cấp quá dài");
  if (!(a.price >= 0)) return fail("Đơn giá không hợp lệ");
  applyImport(m, a.qty, a.price);
  c.s.materialTxns.push({ id: uid(c, "t"), material: m.id, type: "in", qty: a.qty, price: a.price, supplier: a.supplier.trim() || "Không ghi", stockAfter: m.stock, avgAfter: m.avgPrice, by: c.me, at: tick(c) });
  checkLow(c, m);
  return ok(`Đã nhập ${nf(a.qty, 2)} ${m.unit} ${m.code}, giá BQ mới ${vnd(m.avgPrice)}`);
}

const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9-]{1,19}$/;

// Không truyền mã thì tự sinh theo loại (VAI-01, NUT-02…)
// Kiểm tra 2 ngưỡng: báo hết < báo đủ
function thresholdError(min: number, ok: number) {
  if (!(min >= 0) || !(ok >= 0)) return "Ngưỡng không hợp lệ";
  if (min > LIMITS.minStock || ok > LIMITS.minStock) return "Ngưỡng quá lớn";
  if (ok <= min) return "Ngưỡng báo đủ phải lớn hơn ngưỡng báo hết";
  return null;
}

export function createMaterial(c: Ctx, a: { code?: string; name: string; unit: string; category: MaterialCategory; minStock: number; okStock?: number }): Result {
  if (!(a.category in MATERIAL_CATEGORIES)) return fail("Chọn loại phụ liệu");
  const code = (a.code?.trim() || nextMaterialCode(a.category, c.s.materials)).toUpperCase(), name = a.name.trim(), unit = a.unit.trim();
  if (!CODE_RE.test(code)) return fail("Mã chỉ gồm chữ, số, dấu gạch ngang (2–20 ký tự)");
  if (c.s.materials.some(m => m.code === code)) return fail(`Mã ${code} đã có`);
  if (!name) return fail("Nhập tên phụ liệu");
  if (name.length > LIMITS.name) return fail("Tên phụ liệu quá dài");
  if (unit.length > 20) return fail("Đơn vị tính quá dài");
  if (!unit) return fail("Nhập đơn vị tính");
  const okStock = a.okStock ?? Math.ceil(a.minStock * 1.3);
  const terr = thresholdError(a.minStock, okStock);
  if (terr) return fail(terr);
  c.s.materials.push({ id: uid(c, "m"), code, name, unit, category: a.category, minStock: a.minStock, okStock, stock: 0, avgPrice: 0, totalImportQty: 0, totalImportCost: 0, status: "active", lowAlertedAt: null });
  return ok(`Đã thêm phụ liệu ${code}. Giờ có thể nhập kho.`);
}

export function setMaterialStatus(c: Ctx, id: string, status: ItemStatus): Result {
  const m = byId(c.s.materials, id);
  if (!m) return fail("Không tìm thấy phụ liệu");
  if (!(status in MATERIAL_STATUS)) return fail("Tình trạng không hợp lệ");
  if (m.status === status) return fail("Tình trạng không đổi");
  m.status = status;
  if (status === "active") checkLow(c, m);
  return ok(`${m.code}: ${MATERIAL_STATUS[status]}`);
}

export function setThresholds(c: Ctx, id: string, a: { minStock: number; okStock: number }): Result {
  const m = byId(c.s.materials, id);
  if (!m) return fail("Không tìm thấy phụ liệu");
  const terr = thresholdError(a.minStock, a.okStock);
  if (terr) return fail(terr);
  m.minStock = a.minStock;
  m.okStock = a.okStock;
  // Đổi ngưỡng xong: đang dưới ngưỡng hết mà chưa báo thì báo ngay; đã đủ thì mở lại cảnh báo
  if (m.status === "active") checkLow(c, m);
  if (m.stock >= m.okStock) m.lowAlertedAt = null;
  return ok(`${m.code}: báo hết dưới ${nf(a.minStock)}, báo đủ từ ${nf(a.okStock)} ${m.unit}`);
}

/* ---------- xưởng may ---------- */
type WorkshopInput = { name: string; area: string; contactName: string; phone: string };
function workshopError(c: Ctx, a: WorkshopInput, selfId?: string) {
  const name = a.name.trim(), phone = a.phone.trim();
  if (!name) return "Nhập tên xưởng";
  if (name.length > LIMITS.name || tooLong(a.area, 60) || tooLong(a.contactName, 60)) return "Thông tin quá dài";
  if (!/^[0-9 +.]{9,15}$/.test(phone)) return "Số điện thoại không hợp lệ (9–15 số)";
  if (c.s.workshops.some(w => w.id !== selfId && w.name.trim().toLowerCase() === name.toLowerCase())) return `Xưởng ${name} đã có`;
  return null;
}

export function createWorkshop(c: Ctx, a: WorkshopInput): Result {
  const err = workshopError(c, a);
  if (err) return fail(err);
  c.s.workshops.push({ id: uid(c, "w"), name: a.name.trim(), area: a.area.trim(), contactName: a.contactName.trim(), phone: a.phone.trim(), active: true });
  return ok(`Đã thêm ${a.name.trim()}`);
}

export function updateWorkshop(c: Ctx, id: string, a: WorkshopInput): Result {
  const w = byId(c.s.workshops, id);
  if (!w) return fail("Không tìm thấy xưởng");
  const err = workshopError(c, a, id);
  if (err) return fail(err);
  Object.assign(w, { name: a.name.trim(), area: a.area.trim(), contactName: a.contactName.trim(), phone: a.phone.trim() });
  return ok(`Đã cập nhật ${w.name}`);
}

// Ngừng hợp tác: không giao lệnh mới, lịch sử giữ nguyên
export function toggleWorkshop(c: Ctx, id: string): Result {
  const w = byId(c.s.workshops, id);
  if (!w) return fail("Không tìm thấy xưởng");
  if (w.active && (c.s.customerRepairs ?? []).some(r => r.workshop === id && r.status === "sent")) return fail(`${w.name} đang giữ đồ khách gửi sửa`);
  if (w.active && c.s.orders.some(o => o.workshop === id && isLive(o))) return fail(`${w.name} còn lệnh đang chạy, xong lệnh rồi mới ngừng được`);
  w.active = !w.active;
  return ok(w.active ? `Đã hợp tác lại với ${w.name}` : `Đã ngừng hợp tác với ${w.name}`);
}

/* ---------- đồ khách gửi sửa ---------- */
type CustomerRepairInput = { customerName: string; customerPhone: string; item: string; size: string; request: string; note?: string; promisedDate: string };

export function createCustomerRepair(c: Ctx, a: CustomerRepairInput): Result {
  const name = a.customerName.trim(), phone = a.customerPhone.trim(), item = a.item.trim(), request = a.request.trim();
  if (!name) return fail("Nhập tên khách");
  if (!/^[0-9 +.]{9,15}$/.test(phone)) return fail("Số điện thoại khách không hợp lệ (9–15 số)");
  if (!item) return fail("Nhập sản phẩm khách gửi");
  if (!request) return fail("Ghi khách muốn sửa gì");
  if (name.length > 60 || item.length > LIMITS.name || tooLong(a.size, 10) || request.length > LIMITS.text || tooLong(a.note, LIMITS.text)) return fail("Thông tin quá dài");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.promisedDate)) return fail("Chọn ngày hẹn trả khách");
  const promisedAt = new Date(`${a.promisedDate}T23:59:59+07:00`);
  if (isNaN(promisedAt.getTime()) || promisedAt < c.now) return fail("Ngày hẹn trả phải từ hôm nay trở đi");
  if (promisedAt.getTime() > c.now.getTime() + LIMITS.dueDays * DAY) return fail("Ngày hẹn quá xa (tối đa 1 năm)");
  const n = c.s.seq.customer ?? 1;
  c.s.seq.customer = n + 1;
  const code = `KS-${String(n).padStart(3, "0")}`;
  c.s.customerRepairs ??= [];
  c.s.customerRepairs.push({
    id: code, code, customerName: name, customerPhone: phone, item, size: a.size.trim().toUpperCase(), request,
    note: a.note?.trim() || undefined, receivedAt: c.now, promisedAt, status: "received",
    history: [{ at: tick(c), by: c.me, text: `Nhận từ khách: ${request}` }],
  });
  notify(c, ["quanly", "kho"], `🧵 Đồ khách gửi sửa ${code}: ${item}${a.size ? ` (${a.size})` : ""}\nKhách ${name} · muốn sửa: ${request}\nHẹn trả ${fmtD(promisedAt)}.`);
  return ok(`Đã nhận ${code} từ khách ${name}`, code);
}

function getCR(c: Ctx, id: string) {
  return (c.s.customerRepairs ?? []).find(x => x.id === id);
}

export function sendCustomerRepair(c: Ctx, id: string, workshopId: string): Result {
  const r = getCR(c, id);
  if (!r) return fail("Không tìm thấy phiếu");
  if (r.status !== "received") return fail("Phiếu không ở bước chờ gửi xưởng");
  const w = byId(c.s.workshops, workshopId);
  if (!w || !w.active) return fail("Chọn xưởng đang hợp tác");
  r.status = "sent"; r.workshop = w.id; r.sentAt = c.now;
  r.history.push({ at: tick(c), by: c.me, text: `Gửi ${w.name} sửa` });
  return ok(`${r.code}: đã gửi ${w.name}`);
}

export function customerRepairBack(c: Ctx, id: string): Result {
  const r = getCR(c, id);
  if (!r) return fail("Không tìm thấy phiếu");
  if (r.status !== "sent") return fail("Phiếu chưa gửi xưởng");
  r.status = "returned"; r.returnedAt = c.now;
  r.history.push({ at: tick(c), by: c.me, text: `${wsName(c.s, r.workshop ?? "")} trả về, chờ trả khách` });
  notify(c, ["quanly", "kho"], `📦 ${r.code} đã sửa xong, chờ trả khách ${r.customerName} (${r.customerPhone}).`);
  return ok(`${r.code}: xưởng đã trả về`);
}

export function customerRepairDone(c: Ctx, id: string): Result {
  const r = getCR(c, id);
  if (!r) return fail("Không tìm thấy phiếu");
  if (r.status !== "returned") return fail("Xưởng chưa trả đồ về");
  r.status = "done"; r.doneAt = c.now;
  r.history.push({ at: tick(c), by: c.me, text: "Đã trả khách" });
  return ok(`${r.code}: đã trả khách ${r.customerName}`);
}

// Nhân viên tự ghi chú thêm bất cứ lúc nào (khách đổi yêu cầu, xưởng báo…)
export function noteCustomerRepair(c: Ctx, id: string, text: string): Result {
  const r = getCR(c, id);
  if (!r) return fail("Không tìm thấy phiếu");
  const t = text.trim();
  if (!t) return fail("Nhập nội dung ghi chú");
  if (t.length > LIMITS.text) return fail("Ghi chú quá dài");
  r.history.push({ at: tick(c), by: c.me, text: `📝 ${t}` });
  return ok(`${r.code}: đã thêm ghi chú`);
}

/* ---------- sản phẩm ---------- */
// Kiểm tra danh sách size + SKU: không trùng size, SKU không trùng với SKU khác trong hệ thống
function variantsError(c: Ctx, variants: ProductVariant[], selfId?: string) {
  if (variants.length > 200) return "Tối đa 200 phiên bản";
  const sizes = variants.map(v => `${v.size}|${v.color ?? ""}`), skus = variants.map(v => v.sku);
  if (variants.some(v => !v.size || v.size.length > 10)) return "Tên size không hợp lệ";
  if (variants.some(v => !SKU_RE.test(v.sku))) return "SKU chỉ gồm chữ, số, dấu - _ . (2–40 ký tự)";
  if (new Set(sizes).size !== sizes.length) return "Size (cùng màu) bị trùng";
  if (new Set(skus).size !== skus.length) return "Hai size đang trùng SKU";
  for (const p of c.s.products) {
    if (p.id === selfId) continue;
    const taken = [p.sku, ...(p.variants ?? []).map(v => v.sku)];
    const dup = skus.find(x => taken.includes(x));
    if (dup) return `SKU ${dup} đã dùng cho ${p.sku} · ${p.name}`;
  }
  return null;
}
const SKU_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$/;
const num = (x: unknown) => (typeof x === "number" && isFinite(x) && x >= 0 ? x : undefined);
const cleanVariants = (vs: ProductVariant[] = []) =>
  vs.map(v => ({
    size: String(v.size ?? "").trim().toUpperCase(),
    color: String(v.color ?? "").trim() || undefined,
    sku: String(v.sku ?? "").trim().toUpperCase(),
    barcode: String(v.barcode ?? "").trim() || undefined,
    price: num(v.price), cost: num(v.cost),
    image: typeof v.image === "string" && /^https:\/\//.test(v.image) && v.image.length < 400 ? v.image : undefined,
    stock: num(v.stock),
    prices: v.prices && typeof v.prices === "object"
      ? Object.fromEntries(Object.entries(v.prices).filter(([k, x]) => k.length <= 40 && num(x) !== undefined).slice(0, 12))
      : undefined,
  })).filter(v => v.size || v.sku);

export function createProduct(c: Ctx, a: { sku: string; name: string; laborCost: number; bom: BomLine[]; variants?: ProductVariant[] }): Result {
  const sku = a.sku.trim().toUpperCase(), name = a.name.trim();
  if (!CODE_RE.test(sku)) return fail("SKU chỉ gồm chữ, số, dấu gạch ngang (2–20 ký tự)");
  if (c.s.products.some(p => p.sku === sku || p.variants?.some(v => v.sku === sku))) return fail(`SKU ${sku} đã có`);
  const variants = cleanVariants(a.variants);
  const verr = variantsError(c, variants);
  if (verr) return fail(verr);
  if (variants.some(v => v.sku === sku)) return fail("SKU size không được trùng SKU chung của mẫu");
  if (!name) return fail("Nhập tên sản phẩm");
  if (name.length > LIMITS.name) return fail("Tên sản phẩm quá dài");
  if (a.laborCost > LIMITS.labor) return fail("Tiền công may quá lớn");
  if (a.bom.length > LIMITS.bomLines) return fail(`Định mức tối đa ${LIMITS.bomLines} phụ liệu`);
  if (a.bom.some(l => l.qtyPerUnit > LIMITS.bomQty)) return fail(`Định mức mỗi phụ liệu tối đa ${LIMITS.bomQty}`);
  if (!(a.laborCost >= 0)) return fail("Tiền công may không hợp lệ");
  const bom = a.bom.filter(l => l.material);
  if (!bom.length) return fail("Thêm ít nhất 1 phụ liệu vào định mức");
  if (bom.some(l => !(l.qtyPerUnit > 0))) return fail("Định mức mỗi phụ liệu phải lớn hơn 0");
  if (new Set(bom.map(l => l.material)).size !== bom.length) return fail("Một phụ liệu bị chọn 2 lần");
  if (bom.some(l => byId(c.s.materials, l.material)?.status !== "active")) return fail("Định mức chỉ dùng phụ liệu đang dùng");
  c.s.products.push({ id: uid(c, "p"), sku, name, laborCost: a.laborCost, bom, variants: variants.length ? variants : undefined, status: "active" });
  return ok(`Đã thêm sản phẩm ${sku}${variants.length ? ` (${variants.length} size)` : ""}`);
}

/* ---------- nhập sản phẩm từ file Excel xuất của Sapo ---------- */
export interface SapoItem { name: string; category?: string; tags?: string[]; variants: ProductVariant[] }

// Khớp theo SKU phiên bản (hoặc cùng tên) → cập nhật; chưa có → tạo mới (chưa có định mức).
// Định mức + tiền công đã khai báo trong app luôn được giữ nguyên.
export function importSapo(c: Ctx, items: SapoItem[]): Result {
  if (!Array.isArray(items) || !items.length) return fail("File không có sản phẩm nào");
  if (items.length > 60) return fail("Mỗi lần gửi tối đa 60 mẫu");
  let created = 0, updated = 0;
  for (const it of items) {
    const name = String(it.name ?? "").trim();
    if (!name || name.length > LIMITS.name) return fail(`Tên sản phẩm không hợp lệ: ${name.slice(0, 40)}`);
    const variants = cleanVariants(it.variants);
    if (!variants.length) continue;
    const skus = new Set(variants.map(v => v.sku));
    const p = c.s.products.find(x => x.variants?.some(v => skus.has(v.sku)))
      ?? c.s.products.find(x => x.name.trim().toLowerCase() === name.toLowerCase());
    const verr = variantsError(c, variants, p?.id);
    if (verr) return fail(`${name}: ${verr}`);
    const category = String(it.category ?? "").trim().slice(0, 60) || undefined;
    const tags = (it.tags ?? []).map(t => String(t).trim()).filter(Boolean).slice(0, 10);
    if (p) {
      p.name = name; p.variants = variants; p.category = category ?? p.category; p.tags = tags.length ? tags : p.tags; p.source = "sapo";
      updated++;
    } else {
      let base = `M-${variants[0].sku}`.slice(0, 40);
      while (c.s.products.some(x => x.sku === base)) base = `${base.slice(0, 36)}-${c.s.seq.id++}`;
      c.s.products.push({ id: uid(c, "p"), sku: base, name, laborCost: 0, bom: [], variants, category, tags, source: "sapo", status: "active" });
      created++;
    }
  }
  return ok(`Sapo: thêm ${created} mẫu, cập nhật ${updated} mẫu`);
}

export function setProductBom(c: Ctx, id: string, a: { laborCost: number; bom: BomLine[] }): Result {
  const p = byId(c.s.products, id);
  if (!p) return fail("Không tìm thấy sản phẩm");
  if (!(a.laborCost >= 0) || a.laborCost > LIMITS.labor) return fail("Tiền công may không hợp lệ");
  const bom = (a.bom ?? []).filter(l => l.material);
  if (!bom.length) return fail("Thêm ít nhất 1 phụ liệu vào định mức");
  if (bom.length > LIMITS.bomLines) return fail(`Định mức tối đa ${LIMITS.bomLines} phụ liệu`);
  if (bom.some(l => !(l.qtyPerUnit > 0) || l.qtyPerUnit > LIMITS.bomQty)) return fail("Định mức mỗi phụ liệu phải lớn hơn 0");
  if (new Set(bom.map(l => l.material)).size !== bom.length) return fail("Một phụ liệu bị chọn 2 lần");
  if (bom.some(l => !byId(c.s.materials, l.material))) return fail("Phụ liệu không tồn tại");
  p.bom = bom;
  p.laborCost = a.laborCost;
  return ok(`${p.name}: đã lưu định mức (${bom.length} phụ liệu)`);
}

// Tìm phiên bản theo SKU / barcode (quét mã)
export function findBySku(s: DataState, code: string) {
  const k = code.trim().toUpperCase();
  if (!k) return null;
  for (const p of s.products) {
    const v = p.variants?.find(x => x.sku === k || x.barcode?.toUpperCase() === k);
    if (v) return { product: p, variant: v };
  }
  return null;
}

// Thêm / sửa size + SKU cho sản phẩm đã có
export function setProductVariants(c: Ctx, id: string, list: ProductVariant[]): Result {
  const p = byId(c.s.products, id);
  if (!p) return fail("Không tìm thấy sản phẩm");
  const variants = cleanVariants(list);
  const verr = variantsError(c, variants, id);
  if (verr) return fail(verr);
  if (variants.some(v => v.sku === p.sku)) return fail("SKU size không được trùng SKU chung của mẫu");
  p.variants = variants.length ? variants : undefined;
  return ok(`${p.sku}: đã lưu ${variants.length} size`);
}

export function setProductStatus(c: Ctx, id: string, status: ItemStatus): Result {
  const p = byId(c.s.products, id);
  if (!p) return fail("Không tìm thấy sản phẩm");
  if (!(status in PRODUCT_STATUS)) return fail("Tình trạng không hợp lệ");
  if (p.status === status) return fail("Tình trạng không đổi");
  p.status = status;
  return ok(`${p.sku}: ${PRODUCT_STATUS[status]}`);
}

/* ---------- phiếu nhập kho nhiều dòng (có thể kèm phụ liệu mới) ---------- */
export interface NewMaterialInput { code?: string; name: string; unit: string; category: MaterialCategory; minStock: number; okStock?: number }
export interface ImportLine { materialId?: string; newMaterial?: NewMaterialInput; qty: number; price: number }

export function importBatch(c: Ctx, a: { supplier: string; lines: ImportLine[] }): Result {
  if (!a.lines.length) return fail("Phiếu nhập chưa có dòng nào");
  if (a.lines.length > LIMITS.lines) return fail(`Một phiếu tối đa ${LIMITS.lines} dòng`);
  const ids = new Set<string>();
  for (const [i, l] of a.lines.entries()) {
    const row = `Dòng ${i + 1}: `;
    let id = l.materialId;
    if (l.newMaterial) {
      const r = createMaterial(c, l.newMaterial);
      if (!r.ok) return fail(row + r.error);
      id = c.s.materials[c.s.materials.length - 1].id;
    }
    if (!id) return fail(row + "chọn phụ liệu");
    if (ids.has(id)) return fail(row + "phụ liệu bị lặp, gộp vào 1 dòng");
    ids.add(id);
    const r = importMaterial(c, { materialId: id, qty: l.qty, price: l.price, supplier: a.supplier });
    if (!r.ok) return fail(row + r.error);
  }
  const created = a.lines.filter(l => l.newMaterial).length;
  return ok(`Đã nhập kho ${a.lines.length} dòng${created ? `, thêm ${created} phụ liệu mới` : ""}`);
}

/* ---------- thông báo soạn tay cho từng thành viên ---------- */
export function sendMessage(c: Ctx, a: { userIds: string[]; text: string }): Result {
  const text = a.text.trim();
  const users = a.userIds.map(id => byId(c.s.users, id)).filter(u => u && u.active);
  if (!users.length) return fail("Chọn ít nhất 1 người nhận");
  if (!text) return fail("Nhập nội dung thông báo");
  if (text.length > LIMITS.text) return fail(`Nội dung tối đa ${LIMITS.text} ký tự`);
  c.s.notifications.unshift({
    id: uid(c, "n"), roles: [...new Set(users.map(u => u!.role))], users: users.map(u => u!.id),
    from: c.me, text, sentAt: tick(c), ok: true,
  });
  return ok(`Đã gửi thông báo cho ${users.length} người`);
}

/* ---------- lệnh sản xuất ---------- */
export function createOrder(c: Ctx, a: { productId: string; workshopId: string; sizes: SizeQty[]; dueDate: string; color?: string }): Result {
  const sizes = a.sizes.map(x => ({ size: x.size.trim().toUpperCase(), qty: x.qty })).filter(x => x.size && x.qty);
  if (!sizes.length) return fail("Nhập số lượng ít nhất 1 size");
  if (sizes.some(x => !isInt(x.qty) || x.qty < 0)) return fail("Số lượng mỗi size phải là số nguyên");
  if (new Set(sizes.map(x => x.size)).size !== sizes.length) return fail("Size bị trùng");
  if (sizes.length > LIMITS.sizes) return fail(`Tối đa ${LIMITS.sizes} size`);
  if (sizes.some(x => x.size.length > 10)) return fail("Tên size quá dài");
  const qty = sizes.reduce((t, x) => t + x.qty, 0);
  if (qty > LIMITS.orderQty) return fail(`Một lệnh tối đa ${nf(LIMITS.orderQty)} cái`);
  const p = byId(c.s.products, a.productId);
  if (!p) return fail("Chọn sản phẩm");
  if (p.status !== "active") return fail(`${p.sku} đang ${PRODUCT_STATUS[p.status].toLowerCase()}, không tạo lệnh được`);
  const bad = unusableMaterials(p, c.s.materials);
  if (bad.length) return fail(`Phụ liệu ${bad.map(m => `${m.code} (${MATERIAL_STATUS[m.status].toLowerCase()})`).join(", ")} không dùng được cho lệnh mới`);
  if (!p.bom.length) return fail(`${p.name} chưa có định mức phụ liệu, khai báo ở trang Sản phẩm trước`);
  const colors = [...new Set((p.variants ?? []).map(v => v.color).filter(Boolean))] as string[];
  const color = a.color?.trim() || undefined;
  if (colors.length > 1 && !color) return fail("Sản phẩm có nhiều màu, chọn màu cho lệnh");
  if (color && colors.length && !colors.includes(color)) return fail(`Màu ${color} không có trong sản phẩm`);
  const ws = byId(c.s.workshops, a.workshopId);
  if (!ws) return fail("Chọn xưởng");
  if (!ws.active) return fail(`${ws.name} đã ngừng hợp tác`);
  // Ngày dự kiến hoàn thành (yyyy-mm-dd), hết hạn lúc 23:59 giờ Việt Nam ngày đó
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.dueDate)) return fail("Chọn ngày dự kiến hoàn thành");
  const dueAt = new Date(`${a.dueDate}T23:59:59+07:00`);
  if (isNaN(dueAt.getTime())) return fail("Ngày dự kiến không hợp lệ");
  if (dueAt < c.now) return fail("Ngày dự kiến phải từ hôm nay trở đi");
  if (dueAt.getTime() > c.now.getTime() + LIMITS.dueDays * DAY) return fail("Ngày dự kiến quá xa (tối đa 1 năm)");
  if (shortages(p, qty, c.s.materials).length) return fail("Không đủ phụ liệu, cần nhập thêm trước khi tạo lệnh");
  const code = `LSX-${String(c.s.seq.order++).padStart(4, "0")}`;
  const o: ProductionOrder = {
    id: code, code, product: p.id, workshop: a.workshopId, qty, sizes, color: color ?? (colors.length === 1 ? colors[0] : undefined), step: "cut",
    unitCost: unitCost(p, c.s.materials), loss: 0, lossApproved: false, batches: [],
    createdBy: c.me, createdAt: c.now, dueAt,
  };
  c.s.orders.push(o);
  const need = needFor(p, qty, c.s.materials);
  for (const n of need) {
    applyIssue(n.material, n.qty);
    c.s.materialTxns.push({ id: uid(c, "t"), material: n.material.id, type: "out", qty: n.qty, order: code, stockAfter: n.material.stock, avgAfter: n.material.avgPrice, by: c.me, at: tick(c) });
  }
  notify(c, ["quanly", "kho"], `🆕 Lệnh ${code}: ${p.name} × ${qty} (${sizes.map(x => `${x.size}:${x.qty}`).join(" ")})\nGiao ${wsName(c.s, a.workshopId)} cắt + may, hạn ${fmtD(o.dueAt)}.\nKho đã xuất phụ liệu theo định mức.`);
  need.forEach(n => checkLow(c, n.material));
  return ok(`Đã tạo ${code} và xuất phụ liệu`, code);
}

export function confirmCut(c: Ctx, orderId: string): Result {
  const o = getOrder(c, orderId);
  if (!o || o.step !== "cut") return fail("Lệnh không ở bước chờ cắt");
  o.step = "sew";
  event(c, "issue", o, o.qty);
  notify(c, ["quanly", "kho"], `✂️ ${o.code}: ${wsName(c.s, o.workshop)} đã cắt xong ${o.qty} cái, bắt đầu may.`);
  return ok("Đã chuyển sang bước may");
}

// Nhận hàng 1 đợt. Lệnh có size: truyền { sizes } (số nhận từng size, không vượt số còn thiếu của size đó)
export function receive(c: Ctx, orderId: string, input: number | { sizes: SizeQty[] }): Result {
  const o = getOrder(c, orderId);
  if (!o || (o.step !== "sew" && o.step !== "qc")) return fail("Lệnh chưa ở bước nhận hàng");
  const b = calcBalance(o, repairsOf(c.s, o));
  let qty: number;
  let sizes: SizeQty[] | undefined;
  if (typeof input === "number") {
    if (o.sizes?.length) return fail("Lệnh có size, nhập số nhận theo từng size");
    qty = input;
  } else {
    const prog = sizeProgress(o);
    sizes = input.sizes.map(x => ({ size: String(x.size).trim().toUpperCase(), qty: x.qty })).filter(x => x.qty);
    for (const x of sizes) {
      const p = prog.find(y => y.size === x.size);
      if (!p) return fail(`Size ${x.size} không có trong lệnh`);
      if (!isInt(x.qty) || x.qty < 0) return fail("Số lượng mỗi size phải là số nguyên");
      if (x.qty > p.missing) return fail(`Size ${x.size} xưởng chỉ còn thiếu ${p.missing} cái`);
    }
    qty = sizes.reduce((t, x) => t + x.qty, 0);
  }
  if (!isInt(qty) || qty < 1 || qty > b.notReturned) return fail(`Nhập từ 1 đến ${b.notReturned}`);
  o.batches.push({ id: uid(c, "b"), receivedAt: tick(c), received: qty, sizes, qc: null });
  o.step = "qc";
  event(c, "receive", o, qty);
  notify(c, ["qc"], `📦 Hàng về chờ QC: ${o.code} · ${wsName(c.s, o.workshop)} trả ${qty} cái ${prodOf(c.s, o).name}${sizes ? ` (${sizes.map(x => `${x.size}:${x.qty}`).join(" ")})` : ""}.`);
  return ok(`Đã nhận ${qty} cái, chờ QC`);
}

// chỉ nhận ảnh đã tải lên Cloudinary
export const PHOTO_RE = /^https:\/\/res\.cloudinary\.com\/[\w-]+\/image\/upload\/[\w/.,%-]+$/;
const photosError = (p: unknown) =>
  p === undefined ? null
  : !Array.isArray(p) || p.length > LIMITS.photos ? `Mỗi dòng lỗi tối đa ${LIMITS.photos} ảnh`
  : p.some(x => typeof x !== "string" || x.length > 400 || !PHOTO_RE.test(x)) ? "Ảnh lỗi không hợp lệ" : null;

// QC tự nhập từng dòng lỗi (loại, size, mô tả, số lượng). Pass = số nhận − tổng lỗi.
export function saveQC(c: Ctx, orderId: string, batchId: string, a: { lines: DefectLine[] }): Result {
  const o = getOrder(c, orderId);
  const bt = o?.batches.find(x => x.id === batchId);
  if (!o || !bt) return fail("Không tìm thấy đợt nhận");
  if (bt.qc) return fail("Đợt này đã QC");
  if (a.lines.length > LIMITS.lines) return fail(`Tối đa ${LIMITS.lines} dòng lỗi`);
  if (a.lines.some(l => tooLong(l.defect, LIMITS.name) || tooLong(l.size, 10))) return fail("Mô tả lỗi hoặc size quá dài");
  if (a.lines.some(l => !["sua", "vai", "hong"].includes(l.kind))) return fail("Loại lỗi không hợp lệ");
  const perr = a.lines.map(l => photosError(l.photos)).find(Boolean);
  if (perr) return fail(perr);
  const lines: DefectLine[] = a.lines.map(l => ({
    kind: l.kind, size: l.size.trim(), defect: l.defect.trim(), qty: l.qty,
    ...(l.photos?.length ? { photos: [...l.photos] } : {}),
  }));
  const lerr = validateDefectLines(lines, (bt.sizes?.length ? bt.sizes : o.sizes)?.map(x => x.size));
  if (lerr) return fail(lerr);
  if (bt.sizes?.length) {
    for (const z of bt.sizes) {
      const n = lines.filter(l => l.size === z.size).reduce((t, l) => t + l.qty, 0);
      if (n > z.qty) return fail(`Size ${z.size} đợt này chỉ nhận ${z.qty} cái, không thể có ${n} cái lỗi`);
    }
  }
  const tot = (k: DefectLine["kind"]) => lines.filter(l => l.kind === k).reduce((t, l) => t + l.qty, 0);
  const sua = tot("sua"), vai = tot("vai"), hong = tot("hong");
  const q = { pass: bt.received - sua - vai - hong, sua, vai, hong };
  if (q.pass < 0) return fail(`Tổng lỗi vượt số nhận (${bt.received})`);
  const err = validateQC(bt.received, q);
  if (err) return fail(err);
  const suaLines = lines.filter(l => l.kind === "sua");
  const summary = (ls: DefectLine[]) => [...new Set(ls.map(l => l.defect))].join(", ");
  bt.qc = { ...q, defect: summary(lines) || "Không lỗi", lines, photos: lines.flatMap(l => l.photos ?? []), by: c.me, at: c.now };
  event(c, "pass", o, q.pass, 1);
  event(c, "sua", o, q.sua, 1);
  event(c, "vai", o, q.vai, 1);
  event(c, "hong", o, q.hong, 1);
  addFinished(c, o, q.pass);
  const p = prodOf(c.s, o);
  if (q.sua > 0) {
    const code = `R-${String(c.s.seq.repair++).padStart(3, "0")}`;
    c.s.repairs.push({
      id: code, code, order: o.id, workshop: o.workshop, qty: q.sua, defect: summary(suaLines), photos: suaLines.flatMap(l => l.photos ?? []), round: 1,
      items: suaLines.map(l => ({ size: l.size, defect: l.defect, qty: l.qty, ...(l.photos?.length ? { photos: l.photos } : {}) })),
      sentAt: c.now, dueAt: new Date(c.now.getTime() + REPAIR_DUE_DAYS * DAY), status: "sent",
      history: [{ at: tick(c), by: c.me, text: "QC tạo phiếu, gửi trả xưởng" }],
    });
    notify(c, ["quanly", "kho"], `🔁 Phiếu ${code}: trả ${q.sua} cái ${p.name} về ${wsName(c.s, o.workshop)}\nLỗi: ${suaLines.map(l => `${l.size} ${l.defect} ×${l.qty}`).join("; ")} · hạn trả ${fmtD(new Date(c.now.getTime() + REPAIR_DUE_DAYS * DAY))} · lệnh ${o.code}.`);
  }
  if (q.pass > 0) notify(c, ["quanly", "kho"], `📦 Đã nhập kho thành phẩm ${q.pass} cái ${p.name} (${o.code}).`);
  return ok(`Đã lưu QC: ${q.pass} pass, ${q.sua + q.vai + q.hong} fail`);
}

export function reportLoss(c: Ctx, orderId: string, qty: number): Result {
  const o = getOrder(c, orderId);
  if (!o || o.step === "done" || o.step === "cut") return fail("Lệnh không ở bước ghi hao hụt");
  const b = calcBalance(o, repairsOf(c.s, o));
  if (!isInt(qty) || qty < 1 || qty > b.notReturned) return fail(`Nhập từ 1 đến ${b.notReturned}`);
  o.loss += qty;
  o.lossApproved = false;
  event(c, "loss", o, qty);
  // Quy ra vải: mét vải đã giao cho lệnh ÷ số cái = mét / cái
  const fabric = c.s.materialTxns.filter(t => t.type === "out" && t.order === o.code && byId(c.s.materials, t.material)?.category === "vai").reduce((t, x) => t + x.qty, 0);
  const meters = o.qty ? (fabric / o.qty) * o.loss : 0;
  notify(c, ["quanly", "kho"], `⚠️ ${o.code}: ${wsName(c.s, o.workshop)} báo hao hụt ${o.loss} cái${meters ? ` ≈ ${nf(meters, 1)} mét vải` : ""} (${((o.loss / o.qty) * 100).toFixed(1)}%). Cần duyệt.`);
  return ok("Đã ghi hao hụt, chờ Quản lý duyệt");
}

export function approveLoss(c: Ctx, orderId: string): Result {
  const o = getOrder(c, orderId);
  if (!o || !o.loss || o.lossApproved) return fail("Không có hao hụt chờ duyệt");
  o.lossApproved = true;
  o.lossApprovedBy = c.me;
  return ok("Đã duyệt hao hụt");
}

export function closeOrder(c: Ctx, orderId: string): Result {
  const o = getOrder(c, orderId);
  if (!o || o.step === "done") return fail("Lệnh đã đóng");
  const b = calcBalance(o, repairsOf(c.s, o));
  if (!canClose(o, b)) return fail("Chưa đủ điều kiện đóng lệnh");
  o.step = "done";
  o.closedAt = c.now;
  o.closedBy = c.me;
  notify(c, ["quanly", "kho"], `✅ Hoàn thành ${o.code}: ${prodOf(c.s, o).name}\nGiao ${o.qty} · pass ${b.pass} · loại ${b.scrap} · hao hụt ${b.loss}.`);
  return ok(`Đã đóng lệnh ${o.code}`);
}

/* ---------- admin: sửa / hủy lệnh ---------- */
// Hoàn phụ liệu về kho: ghi "adjust" (không đổi giá BQ vì không phải mua mới)
function returnMaterial(c: Ctx, m: Material, qty: number, code: string, reason: string) {
  if (qty <= 0) return;
  m.stock = Math.round((m.stock + qty) * 100) / 100;
  c.s.materialTxns.push({ id: uid(c, "t"), material: m.id, type: "adjust", qty, order: code, reason, stockAfter: m.stock, avgAfter: m.avgPrice, by: c.me, at: tick(c) });
}

export function cancelOrder(c: Ctx, id: string, a: { reason: string; returnMaterials: boolean; removeFinished: boolean }): Result {
  const o = byId(c.s.orders, id);
  if (!o) return fail("Không tìm thấy lệnh");
  if (o.cancelled) return fail("Lệnh đã hủy rồi");
  const reason = a.reason.trim();
  if (!reason) return fail("Ghi lý do hủy lệnh");
  if (reason.length > LIMITS.text) return fail("Lý do quá dài");
  // phụ liệu đã xuất cho lệnh (trừ phần đã hoàn trước đó)
  if (a.returnMaterials) {
    const net = new Map<string, number>();
    for (const t of c.s.materialTxns) if (t.order === o.code) {
      if (t.type === "out") net.set(t.material, (net.get(t.material) ?? 0) + t.qty);
      if (t.type === "adjust") net.set(t.material, (net.get(t.material) ?? 0) - t.qty);
    }
    for (const [mid, qty] of net) { const m = byId(c.s.materials, mid); if (m) { returnMaterial(c, m, Math.round(qty * 100) / 100, o.code, `Hoàn kho do hủy lệnh ${o.code}`); checkLow(c, m); } }
  }
  // trừ thành phẩm đã nhập từ lệnh này
  if (a.removeFinished) {
    const qty = c.s.finishedTxns.filter(t => t.order === o.code).reduce((t, x) => t + x.qty, 0);
    if (qty > 0) c.s.finishedTxns.push({ id: uid(c, "f"), product: o.product, qty: -qty, order: o.code, note: `Trừ do hủy lệnh ${o.code}`, by: c.me, at: tick(c) });
  }
  // phiếu sửa còn mở → đóng
  for (const r of c.s.repairs) if (r.order === o.id && r.status !== "closed") {
    r.status = "closed";
    r.history.push({ at: tick(c), by: c.me, text: `Đóng do hủy lệnh ${o.code}` });
  }
  o.cancelled = { at: c.now, by: c.me, reason };
  notify(c, ["quanly", "kho"], `🗑️ Đã hủy lệnh ${o.code} (${prodOf(c.s, o).name} × ${o.qty}).\nLý do: ${reason}`);
  return ok(`Đã hủy lệnh ${o.code}`);
}

export function editOrder(c: Ctx, id: string, a: { workshopId?: string; dueDate?: string; sizes?: SizeQty[] }): Result {
  const o = byId(c.s.orders, id);
  if (!o) return fail("Không tìm thấy lệnh");
  if (o.cancelled) return fail("Lệnh đã hủy, không sửa được");
  if (o.step === "done") return fail("Lệnh đã hoàn thành, không sửa được");
  const changes: string[] = [];

  if (a.dueDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.dueDate)) return fail("Ngày dự kiến không hợp lệ");
    const dueAt = new Date(`${a.dueDate}T23:59:59+07:00`);
    if (isNaN(dueAt.getTime()) || dueAt.getTime() > c.now.getTime() + LIMITS.dueDays * DAY) return fail("Ngày dự kiến không hợp lệ");
    if (dueAt.getTime() !== o.dueAt.getTime()) { o.dueAt = dueAt; changes.push(`hạn ${fmtD(dueAt)}`); }
  }

  const onlyBeforeCut = (what: string) => fail(`Lệnh đã cắt, không đổi ${what} được nữa (chỉ đổi ngày dự kiến)`);
  if (a.workshopId && a.workshopId !== o.workshop) {
    if (o.step !== "cut") return onlyBeforeCut("xưởng");
    const w = byId(c.s.workshops, a.workshopId);
    if (!w || !w.active) return fail("Chọn xưởng đang hợp tác");
    o.workshop = w.id;
    changes.push(`xưởng ${w.name}`);
  }

  if (a.sizes) {
    const sizes = a.sizes.map(x => ({ size: x.size.trim().toUpperCase(), qty: x.qty })).filter(x => x.size && x.qty);
    const same = JSON.stringify(sizes) === JSON.stringify(o.sizes ?? []);
    if (!same) {
      if (o.step !== "cut") return onlyBeforeCut("số lượng");
      if (!sizes.length) return fail("Nhập số lượng ít nhất 1 size");
      if (sizes.some(x => !isInt(x.qty) || x.qty < 0)) return fail("Số lượng mỗi size phải là số nguyên");
      if (sizes.length > LIMITS.sizes || new Set(sizes.map(x => x.size)).size !== sizes.length) return fail("Size bị trùng hoặc quá nhiều");
      const qty = sizes.reduce((t, x) => t + x.qty, 0);
      if (qty > LIMITS.orderQty) return fail(`Một lệnh tối đa ${nf(LIMITS.orderQty)} cái`);
      // xuất thêm / hoàn lại phần chênh lệch phụ liệu theo định mức
      const p = prodOf(c.s, o);
      const deltas = p.bom.map(b => ({ m: byId(c.s.materials, b.material)!, d: Math.round(b.qtyPerUnit * (qty - o.qty) * 100) / 100 }));
      const short = deltas.filter(x => x.d > 0 && x.d > x.m.stock);
      if (short.length) return fail(`Không đủ phụ liệu để tăng số lượng: ${short.map(x => `${x.m.code} cần thêm ${nf(x.d, 1)}, còn ${nf(x.m.stock, 1)}`).join("; ")}`);
      for (const { m, d } of deltas) {
        if (d > 0) {
          applyIssue(m, d);
          c.s.materialTxns.push({ id: uid(c, "t"), material: m.id, type: "out", qty: d, order: o.code, stockAfter: m.stock, avgAfter: m.avgPrice, by: c.me, at: tick(c) });
        } else returnMaterial(c, m, -d, o.code, `Hoàn kho do giảm số lượng lệnh ${o.code}`);
        checkLow(c, m);
      }
      changes.push(`số lượng ${o.qty} → ${qty} (${sizes.map(x => `${x.size}:${x.qty}`).join(" ")})`);
      o.qty = qty;
      o.sizes = sizes;
    }
  }

  if (!changes.length) return fail("Không có gì thay đổi");
  notify(c, ["quanly", "kho"], `✏️ Đã sửa lệnh ${o.code}: ${changes.join(", ")}.`);
  return ok(`Đã sửa ${o.code}: ${changes.join(", ")}`);
}

/* ---------- phiếu trả sửa ---------- */
export function repairStatus(c: Ctx, id: string, to: "received" | "returned"): Result {
  const r = byId(c.s.repairs, id);
  if (!r) return fail("Không tìm thấy phiếu");
  if (to === "received" && r.status !== "sent") return fail("Phiếu không ở trạng thái đã gửi");
  if (to === "returned" && r.status !== "received") return fail("Xưởng chưa nhận phiếu này");
  r.status = to;
  r.history.push({ at: tick(c), by: c.me, text: to === "received" ? "Xưởng đã nhận" : "Xưởng trả lại, chờ QC lại" });
  if (to === "returned") {
    const o = getOrder(c, r.order)!;
    event(c, "back", o, r.qty, r.round);
    notify(c, ["qc"], `🔁 ${wsName(c.s, r.workshop)} đã trả lại ${r.qty} cái của phiếu ${r.code}, chờ QC lại.`);
    return ok(`${r.code}: chờ QC lại`);
  }
  return ok(`${r.code}: xưởng đã nhận`);
}

export function requc(c: Ctx, id: string, q: { pass: number; again: number; hong: number }): Result {
  const r = byId(c.s.repairs, id);
  if (!r || r.status !== "returned") return fail("Phiếu chưa được xưởng trả lại");
  const err = validateRequc(r.qty, q);
  if (err) return fail(err);
  const o = getOrder(c, r.order)!;
  const round = r.round + 1;
  r.requc = { ...q, by: c.me, at: c.now };
  r.status = "closed";
  r.history.push({ at: tick(c), by: c.me, text: `QC lại: ${q.pass} pass${q.again ? `, ${q.again} sửa tiếp` : ""}${q.hong ? `, ${q.hong} hỏng` : ""}` });
  event(c, "pass", o, q.pass, round);
  event(c, "hong", o, q.hong, round);
  addFinished(c, o, q.pass, r.id);
  if (q.again > 0) {
    const code = `R-${String(c.s.seq.repair++).padStart(3, "0")}`;
    const due = new Date(c.now.getTime() + REPAIR_DUE_DAYS * DAY);
    c.s.repairs.push({
      id: code, code, order: r.order, workshop: r.workshop, qty: q.again, defect: r.defect, photos: r.photos, round,
      sentAt: c.now, dueAt: due, status: "sent", parent: r.id,
      history: [{ at: tick(c), by: c.me, text: `Tạo từ ${r.code}, gửi trả xưởng lần ${round}` }],
    });
    event(c, "sua", o, q.again, round);
    notify(c, ["quanly", "kho"], `🔁 Phiếu ${code} (vòng ${round}): trả tiếp ${q.again} cái về ${wsName(c.s, r.workshop)}, hạn ${fmtD(due)}.`);
  }
  if (q.pass > 0) notify(c, ["quanly", "kho"], `📦 Đã nhập kho thêm ${q.pass} cái ${prodOf(c.s, o).name} sau sửa (${o.code}).`);
  return ok(`${r.code}: đã QC lại`);
}

/* ---------- nhắc việc theo vai trò ---------- */
export function sendReminders(c: Ctx): Result {
  const items = buildReminders(c.s, c.now);
  if (!items.length) return fail("Không có việc gì cần nhắc");
  for (const it of items) notify(c, it.roles, it.text);
  return ok(`Đã gửi nhắc việc (${items.map(i => i.roles.map(r => ROLE_NAME[r]).join("")).join(", ")})`);
}
const ROLE_NAME: Record<Role, string> = { quanly: "Quản lý kho", kho: "Phó kho", qc: "QC" };

/* ---------- báo cáo, nhân viên ---------- */
export function sendReport(c: Ctx, text: string): Result {
  if (!text?.trim() || text.length > 3 * LIMITS.text) return fail("Nội dung báo cáo không hợp lệ");
  notify(c, ["quanly", "kho", "qc"], text);
  return ok("Đã gửi báo cáo vào Telegram");
}

const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;

// Admin cấp tài khoản. passwordHash do server băm, mật khẩu gốc không đi qua đây.
export function createAccount(c: Ctx, a: { name: string; username: string; phone: string; role: Role; title: string; passwordHash: string }): Result {
  const name = a.name.trim(), username = a.username.trim().toLowerCase(), phone = a.phone.trim();
  if (!name) return fail("Nhập tên nhân viên");
  if (name.length > 60 || tooLong(a.title, 40)) return fail("Tên hoặc chức danh quá dài");
  if (!["quanly", "kho", "qc"].includes(a.role)) return fail("Quyền không hợp lệ");
  if (!USERNAME_RE.test(username)) return fail("Tên đăng nhập 3–30 ký tự: chữ thường, số, dấu . _ -");
  if (c.s.users.some(u => u.username === username)) return fail(`Tên đăng nhập ${username} đã có`);
  if (phone && !/^[0-9 +]{9,15}$/.test(phone)) return fail("Số điện thoại không hợp lệ");
  if (!a.passwordHash) return fail("Cần đặt mật khẩu");
  c.s.users.push({ id: uid(c, "u"), name, username, phone, role: a.role, title: a.title.trim() || undefined, passwordHash: a.passwordHash, active: true, createdAt: c.now });
  return ok(`Đã cấp tài khoản ${username} cho ${name}`);
}

export function setPassword(c: Ctx, a: { userId: string; passwordHash: string }): Result {
  const u = byId(c.s.users, a.userId);
  if (!u) return fail("Không tìm thấy nhân viên");
  if (!a.passwordHash) return fail("Cần đặt mật khẩu");
  u.passwordHash = a.passwordHash;
  return ok(`Đã đặt mật khẩu mới cho ${u.name}`);
}

// Mỗi người tự sửa thông tin + ảnh đại diện của mình
export function updateProfile(c: Ctx, a: { name: string; phone: string; avatar?: string | null }): Result {
  const u = c.meId ? byId(c.s.users, c.meId) : undefined;
  if (!u) return fail("Không tìm thấy tài khoản");
  const name = a.name.trim(), phone = a.phone.trim();
  if (!name) return fail("Nhập tên hiển thị");
  if (name.length > 60) return fail("Tên hiển thị quá dài");
  if (!/^[0-9 +]{9,15}$/.test(phone)) return fail("Số điện thoại không hợp lệ");
  if (c.s.users.some(x => x.id !== u.id && x.phone.replace(/s/g, "") === phone.replace(/s/g, ""))) return fail("Số điện thoại đã có người dùng");
  if (a.avatar && (!a.avatar.startsWith("data:image/") || a.avatar.length > 200_000)) return fail("Ảnh không hợp lệ hoặc quá lớn");
  u.name = name;
  u.phone = phone;
  if (a.avatar !== undefined) u.avatar = a.avatar ?? undefined;
  return ok("Đã cập nhật thông tin tài khoản");
}

export function toggleUser(c: Ctx, id: string): Result {
  const u = byId(c.s.users, id);
  if (!u) return fail("Không tìm thấy nhân viên");
  if (u.name === c.me && u.active) return fail("Không thể tự khóa tài khoản của mình");
  u.active = !u.active;
  return ok(u.active ? `Đã mở khóa ${u.name}` : `Đã khóa ${u.name}`);
}

/* ---------- danh sách thao tác: tên → [quyền, hàm, nhãn tiếng Việt] ---------- */
// Server chỉ chạy thao tác có trong danh sách này và tự kiểm tra quyền, không tin giao diện.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ACTIONS: Record<string, [Action | null, (c: Ctx, ...args: any[]) => Result, string]> = {
  importBatch: ["material.import", importBatch, "Nhập kho"],
  importMaterial: ["material.import", importMaterial, "Nhập kho"],
  createMaterial: ["material.manage", createMaterial, "Thêm phụ liệu"],
  setMaterialStatus: ["material.manage", setMaterialStatus, "Đổi tình trạng phụ liệu"],
  setThresholds: ["material.manage", setThresholds, "Đổi ngưỡng báo hết / đủ"],
  createWorkshop: ["workshop.manage", createWorkshop, "Thêm xưởng"],
  updateWorkshop: ["workshop.manage", updateWorkshop, "Sửa thông tin xưởng"],
  toggleWorkshop: ["workshop.manage", toggleWorkshop, "Ngừng / hợp tác lại xưởng"],
  createCustomerRepair: ["customer.repair", createCustomerRepair, "Nhận đồ khách gửi sửa"],
  sendCustomerRepair: ["customer.repair", sendCustomerRepair, "Gửi đồ khách cho xưởng"],
  customerRepairBack: ["customer.repair", customerRepairBack, "Xưởng trả đồ khách"],
  customerRepairDone: ["customer.repair", customerRepairDone, "Trả đồ cho khách"],
  noteCustomerRepair: ["customer.repair", noteCustomerRepair, "Ghi chú đồ khách"],
  createProduct: ["product.manage", createProduct, "Thêm sản phẩm"],
  setProductStatus: ["product.manage", setProductStatus, "Đổi tình trạng sản phẩm"],
  setProductVariants: ["product.manage", setProductVariants, "Sửa size + SKU sản phẩm"],
  importSapo: ["product.manage", importSapo, "Nhập sản phẩm từ Sapo"],
  setProductBom: ["product.manage", setProductBom, "Sửa định mức sản phẩm"],
  createOrder: ["order.create", createOrder, "Tạo lệnh sản xuất"],
  confirmCut: ["order.cut", confirmCut, "Xác nhận đã cắt"],
  receive: ["order.receive", receive, "Nhận hàng từ xưởng"],
  saveQC: ["qc.save", saveQC, "Lưu kết quả QC"],
  reportLoss: ["loss.report", reportLoss, "Ghi hao hụt"],
  approveLoss: ["loss.approve", approveLoss, "Duyệt hao hụt"],
  closeOrder: ["order.close", closeOrder, "Đóng lệnh"],
  editOrder: ["order.admin", editOrder, "Sửa lệnh (admin)"],
  cancelOrder: ["order.admin", cancelOrder, "Hủy lệnh (admin)"],
  repairStatus: ["repair.status", repairStatus, "Cập nhật phiếu sửa"],
  requc: ["repair.requc", requc, "QC lại phiếu sửa"],
  sendReport: ["report.send", sendReport, "Gửi báo cáo Telegram"],
  sendReminders: ["report.send", sendReminders, "Gửi nhắc việc"],
  sendMessage: ["notify.send", sendMessage, "Gửi thông báo"],
  updateProfile: [null, updateProfile, "Sửa thông tin tài khoản"],
  toggleUser: ["user.manage", toggleUser, "Khóa / mở tài khoản"],
  createAccount: ["user.manage", createAccount, "Cấp tài khoản"],
  setPassword: ["user.manage", setPassword, "Đặt mật khẩu"],
};

export const actionName = (fn: unknown) => Object.entries(ACTIONS).find(([, v]) => v[1] === fn)?.[0];
