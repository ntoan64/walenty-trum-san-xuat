// Thao tác nghiệp vụ, chạy ở cả trình duyệt (kiểm tra trước) và server (ghi MongoDB).
// Mỗi hàm nhận bản nháp state (đã clone) và sửa trực tiếp; trả lỗi thì bản nháp bị bỏ.
import {
  applyImport, applyIssue, byId, round2, calcBalance, canClose, DAY, REPAIR_DUE_DAYS,
  MATERIAL_CATEGORIES, MATERIAL_STATUS, nextMaterialCode, colorsOf, forColor, costBreakdown, bomOf, remainingIssue, okLevel, isLive, PRODUCT_STATUS, needFor, shortages, unitCost, unusableMaterials, sizeProgress, validateDefectLines, validateQC, validateRequc,
  type BomLine, type Costing, type RepairTicket, type WorkshopRate, type DefectLine, type EventType, type SizeQty, type ItemStatus, type Material, type MaterialCategory, type ProductionOrder, type ProductVariant, type Role, type Action,
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
// Nhập phụ liệu xong: báo các lệnh đang chờ xuất mã đó (đặt hàng nào cần, xuất được chưa)
function notifyWaiting(c: Ctx, materialIds: string[]) {
  const ids = new Set(materialIds);
  const rows = new Map<string, string[]>();
  for (const o of c.s.orders) {
    if (o.cancelled || !o.pendingIssue) continue;
    for (const r of remainingIssue(c.s, o)) if (ids.has(r.material.id) && r.qty > 0) {
      const k = r.material.id;
      rows.set(k, [...(rows.get(k) ?? []), `${o.code} ${prodOf(c.s, o).name}${o.color ? ` ${o.color}` : ""} (${wsName(c.s, o.workshop)}) cần ${nf(r.qty, 1)}`]);
    }
  }
  if (!rows.size) return;
  const text = [...rows].map(([id, list]) => { const m = byId(c.s.materials, id)!; return `• ${m.code} ${m.name} (tồn ${nf(m.stock, 1)} ${m.unit}):\n   ${list.join("\n   ")}`; }).join("\n");
  notify(c, ["quanly", "kho"], `📦 Vừa nhập phụ liệu, có lệnh đang chờ xuất:\n${text}\nVào lệnh để bấm Xuất phụ liệu.`);
}

export function importMaterial(c: Ctx, a: { materialId: string; qty: number; price: number; supplier: string }, silent = false): Result {
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
  if (!silent) notifyWaiting(c, [m.id]);
  return ok(`Đã nhập ${nf(a.qty, 2)} ${m.unit} ${m.code}, giá BQ mới ${vnd(m.avgPrice)}`);
}

const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9-]{1,19}$/;

// Không truyền mã thì tự sinh theo loại (VAI-01, NUT-02…)
// Kiểm tra 2 ngưỡng: báo hết < báo đủ
function thresholdError(min: number, ok: number) {
  if (!(min >= 0) || !(ok >= 0)) return "Ngưỡng không hợp lệ";
  if (min > LIMITS.minStock || ok > LIMITS.minStock) return "Ngưỡng quá lớn";
  if (min === 0 && ok === 0) return null; // không đặt ngưỡng = không báo hết / báo đủ
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

// Sửa thông tin phụ liệu: mã, tên, đơn vị, loại (lịch sử nhập / xuất nối theo id nên đổi mã không mất)
export function updateMaterial(c: Ctx, id: string, a: { code: string; name: string; unit: string; category: MaterialCategory }): Result {
  const m = byId(c.s.materials, id);
  if (!m) return fail("Không tìm thấy phụ liệu");
  const code = a.code.trim().toUpperCase(), name = a.name.trim(), unit = a.unit.trim();
  if (!CODE_RE.test(code)) return fail("Mã chỉ gồm chữ, số, dấu gạch ngang (2–20 ký tự)");
  if (c.s.materials.some(x => x.id !== id && x.code === code)) return fail(`Mã ${code} đã có`);
  if (!name) return fail("Nhập tên phụ liệu");
  if (name.length > LIMITS.name) return fail("Tên phụ liệu quá dài");
  if (!unit || unit.length > 20) return fail("Đơn vị tính không hợp lệ");
  if (!(a.category in MATERIAL_CATEGORIES)) return fail("Chọn loại phụ liệu");
  const old = m.code;
  Object.assign(m, { code, name, unit, category: a.category });
  return ok(old === code ? `Đã sửa ${code}` : `Đã đổi mã ${old} → ${code}`);
}

// Sửa tay số tồn / giá BQ (kiểm kê, nhập sai): ghi "adjust" chênh lệch vào lịch sử
export function adjustMaterial(c: Ctx, id: string, a: { stock: number; avgPrice: number; reason?: string }): Result {
  const m = byId(c.s.materials, id);
  if (!m) return fail("Không tìm thấy phụ liệu");
  if (!Number.isFinite(a.stock) || a.stock < 0 || a.stock > 1e7) return fail("Số tồn không hợp lệ (không được âm)");
  if (!Number.isFinite(a.avgPrice) || a.avgPrice < 0 || a.avgPrice > 1e9) return fail("Giá BQ không hợp lệ");
  if (tooLong(a.reason, LIMITS.text)) return fail("Lý do quá dài");
  const stock = Math.round(a.stock * 1000) / 1000, avg = Math.round(a.avgPrice);
  const diff = Math.round((stock - m.stock) * 1000) / 1000;
  if (!diff && avg === Math.round(m.avgPrice)) return fail("Không có gì thay đổi");
  const parts = [diff ? `tồn ${nf(m.stock, 2)} → ${nf(stock, 2)}` : "", avg !== Math.round(m.avgPrice) ? `giá BQ ${vnd(m.avgPrice)} → ${vnd(avg)}` : ""].filter(Boolean).join(", ");
  m.stock = stock; m.avgPrice = avg;
  c.s.materialTxns.push({ id: uid(c, "t"), material: m.id, type: "adjust", qty: diff, reason: `Sửa tay: ${parts}${a.reason?.trim() ? ` (${a.reason.trim()})` : ""}`, stockAfter: m.stock, avgAfter: m.avgPrice, by: c.me, at: tick(c) });
  if (m.status === "active") checkLow(c, m);
  return ok(`${m.code}: ${parts}`);
}

// Xóa phụ liệu (kèm lịch sử nhập/xuất của nó). Không xóa khi còn nằm trong định mức sản phẩm
export function deleteMaterial(c: Ctx, id: string): Result {
  const m = byId(c.s.materials, id);
  if (!m) return fail("Không tìm thấy phụ liệu");
  const used = c.s.products.filter(p => p.bom.some(b => b.material === id) || Object.values(p.bomByColor ?? {}).some(l => l.some(b => b.material === id)));
  if (used.length) return fail(`${m.code} đang có trong định mức: ${used.slice(0, 5).map(p => p.name).join(", ")}${used.length > 5 ? "…" : ""}. Bỏ khỏi định mức trước rồi xóa.`);
  c.s.materials = c.s.materials.filter(x => x.id !== id);
  c.s.materialTxns = c.s.materialTxns.filter(t => t.material !== id);
  return ok(`Đã xóa ${m.code} · ${m.name}`);
}

export function setMaterialImage(c: Ctx, id: string, image: string | null): Result {
  const m = byId(c.s.materials, id);
  if (!m) return fail("Không tìm thấy phụ liệu");
  if (image && (image.length > 400 || !PHOTO_RE.test(image))) return fail("Ảnh không hợp lệ");
  m.image = image || undefined;
  return ok(image ? `Đã lưu ảnh ${m.code}` : `Đã bỏ ảnh ${m.code}`);
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
type WorkshopInput = { name: string; area: string; contactName: string; phone: string; kind?: "xuong" | "ncc" };
function workshopError(c: Ctx, a: WorkshopInput, selfId?: string) {
  const name = a.name.trim(), phone = a.phone.trim();
  if (!name) return "Nhập tên xưởng";
  if (name.length > LIMITS.name || tooLong(a.area, 60) || tooLong(a.contactName, 60)) return "Thông tin quá dài";
  if (phone && !/^[0-9 +.]{9,15}$/.test(phone)) return "Số điện thoại không hợp lệ (9–15 số)";
  if (a.kind && a.kind !== "xuong" && a.kind !== "ncc") return "Loại không hợp lệ";
  if (c.s.workshops.some(w => w.id !== selfId && w.name.trim().toLowerCase() === name.toLowerCase())) return `Xưởng ${name} đã có`;
  return null;
}

export function createWorkshop(c: Ctx, a: WorkshopInput): Result {
  const err = workshopError(c, a);
  if (err) return fail(err);
  c.s.workshops.push({ id: uid(c, "w"), name: a.name.trim(), area: a.area.trim(), contactName: a.contactName.trim(), phone: a.phone.trim(), active: true, kind: a.kind ?? "xuong" });
  return ok(`Đã thêm ${a.name.trim()}`);
}

export function updateWorkshop(c: Ctx, id: string, a: WorkshopInput): Result {
  const w = byId(c.s.workshops, id);
  if (!w) return fail("Không tìm thấy xưởng");
  const err = workshopError(c, a, id);
  if (err) return fail(err);
  Object.assign(w, { name: a.name.trim(), area: a.area.trim(), contactName: a.contactName.trim(), phone: a.phone.trim(), ...(a.kind ? { kind: a.kind } : {}) });
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
type CustomerRepairInput = { customerName: string; customerPhone: string; orderCode?: string; item: string; size: string; request: string; note?: string; promisedDate: string };

export function createCustomerRepair(c: Ctx, a: CustomerRepairInput): Result {
  const name = a.customerName.trim(), phone = a.customerPhone.trim(), item = a.item.trim(), request = a.request.trim();
  if (!name) return fail("Nhập tên khách");
  if (!/^[0-9 +.]{9,15}$/.test(phone)) return fail("Số điện thoại khách không hợp lệ (9–15 số)");
  if (!item) return fail("Nhập sản phẩm khách gửi");
  if (!request) return fail("Ghi khách muốn sửa gì");
  const orderCode = (a.orderCode ?? "").trim().toUpperCase();
  if (!orderCode) return fail("Nhập mã đơn hàng Sapo (vd SON15488)");
  if (!/^[A-Z0-9][A-Z0-9_-]{1,29}$/.test(orderCode)) return fail("Mã đơn hàng chỉ gồm chữ, số (vd SON15488)");
  if (name.length > 60 || item.length > LIMITS.name || tooLong(a.size ?? "", 10) || request.length > LIMITS.text || tooLong(a.note, LIMITS.text)) return fail("Thông tin quá dài");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.promisedDate)) return fail("Chọn ngày hẹn trả khách");
  const promisedAt = new Date(`${a.promisedDate}T23:59:59+07:00`);
  if (isNaN(promisedAt.getTime()) || promisedAt < c.now) return fail("Ngày hẹn trả phải từ hôm nay trở đi");
  if (promisedAt.getTime() > c.now.getTime() + LIMITS.dueDays * DAY) return fail("Ngày hẹn quá xa (tối đa 1 năm)");
  const n = c.s.seq.customer ?? 1;
  c.s.seq.customer = n + 1;
  const code = `KS-${String(n).padStart(3, "0")}`;
  c.s.customerRepairs ??= [];
  c.s.customerRepairs.push({
    id: code, code, customerName: name, customerPhone: phone, ...(orderCode ? { orderCode } : {}), item, size: (a.size ?? "").trim().toUpperCase(), request,
    note: a.note?.trim() || undefined, receivedAt: c.now, promisedAt, status: "requested",
    history: [{ at: tick(c), by: c.me, text: `Sale gửi yêu cầu sửa: ${request}` }],
  });
  notify(c, ["quanly", "kho", "qc"], `🧵 Yêu cầu sửa đồ khách ${code}${orderCode ? ` (ĐH ${orderCode})` : ""}: ${item}${a.size ? ` (${a.size})` : ""}\nKhách ${name} · muốn sửa: ${request}\nHẹn trả ${fmtD(promisedAt)}.`);
  return ok(`Đã gửi yêu cầu ${code}, chờ QC nhận hàng`, code);
}

// QC nhận đồ từ sale
export function receiveCustomerRepair(c: Ctx, id: string): Result {
  const r = (c.s.customerRepairs ?? []).find(x => x.id === id);
  if (!r) return fail("Không tìm thấy phiếu");
  if (r.status !== "requested") return fail("Phiếu không ở bước chờ QC nhận");
  r.status = "received"; r.receivedAt = c.now;
  r.history.push({ at: tick(c), by: c.me, text: "QC đã nhận hàng từ sale" });
  return ok(`${r.code}: QC đã nhận hàng`);
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
  r.history.push({ at: tick(c), by: c.me, text: `${wsName(c.s, r.workshop ?? "")} trả về, QC đã kiểm tra, chờ trả sale` });
  notify(c, ["quanly", "kho"], `📦 ${r.code} đã sửa xong, chờ trả khách ${r.customerName} (${r.customerPhone}).`);
  return ok(`${r.code}: xưởng đã trả về`);
}

export function customerRepairDone(c: Ctx, id: string): Result {
  const r = getCR(c, id);
  if (!r) return fail("Không tìm thấy phiếu");
  if (r.status !== "returned") return fail("Xưởng chưa trả đồ về");
  r.status = "handed";
  r.history.push({ at: tick(c), by: c.me, text: "QC đã trả sale, chờ cửa hàng kiểm tra" });
  notify(c, ["quanly", "kho"], `📦 ${r.code}${r.orderCode ? ` (ĐH ${r.orderCode})` : ""}: QC đã trả đồ sửa cho cửa hàng, chờ kiểm tra + nhập SON.`);
  return ok(`${r.code}: đã trả sale, chờ cửa hàng kiểm tra`);
}

// Cửa hàng kiểm tra lại đồ và xác nhận đã nhập SON trên Sapo → hoàn thành
export function storeConfirmCustomerRepair(c: Ctx, id: string, a: { checked: boolean; sonEntered: boolean; note?: string }): Result {
  const r = (c.s.customerRepairs ?? []).find(x => x.id === id);
  if (!r) return fail("Không tìm thấy phiếu");
  if (r.status !== "handed") return fail("QC chưa trả đồ cho cửa hàng");
  if (!a.checked) return fail("Cửa hàng phải kiểm tra lại đồ trước khi hoàn thành");
  if (!a.sonEntered) return fail(`Xác nhận đã nhập SON${r.orderCode ? ` ${r.orderCode}` : ""} trên Sapo`);
  if (tooLong(a.note, LIMITS.text)) return fail("Ghi chú quá dài");
  r.status = "done"; r.doneAt = c.now;
  r.history.push({ at: tick(c), by: c.me, text: `Cửa hàng đã kiểm tra, đã nhập SON${r.orderCode ? ` ${r.orderCode}` : ""} · hoàn thành${a.note?.trim() ? ` (${a.note.trim()})` : ""}` });
  return ok(`${r.code}: hoàn thành`);
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
// maxSize: size tự nhập tối đa 10 ký tự; dữ liệu Sapo có mẫu ghi cả mô tả vào "Kích thước" nên cho dài hơn
function variantsError(c: Ctx, variants: ProductVariant[], selfId?: string, maxSize = 10) {
  if (variants.length > 200) return "Tối đa 200 phiên bản";
  const sizes = variants.map(v => `${v.size}|${v.color ?? ""}`), skus = variants.map(v => v.sku);
  if (variants.some(v => !v.size || v.size.length > maxSize)) return "Tên size không hợp lệ";
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
const numMap = (m: unknown, max: number) => m && typeof m === "object"
  ? Object.fromEntries(Object.entries(m).filter(([k, x]) => k.length <= 40 && num(x) !== undefined).slice(0, max).map(([k, x]) => [k, num(x)!]))
  : undefined;
const cleanVariants = (vs: ProductVariant[] = []) =>
  vs.map(v => ({
    // size ngắn (S, M, XL…) viết hoa; size dài kiểu mô tả của Sapo giữ nguyên
    size: (s => (s.length <= 5 ? s.toUpperCase() : s))(String(v.size ?? "").trim().replace(/\s+/g, " ")),
    color: String(v.color ?? "").trim() || undefined,
    sku: String(v.sku ?? "").trim().toUpperCase(),
    barcode: String(v.barcode ?? "").trim() || undefined,
    price: num(v.price), cost: num(v.cost),
    image: typeof v.image === "string" && /^https:\/\//.test(v.image) && v.image.length < 400 ? v.image : undefined,
    stock: num(v.stock),
    stocks: numMap(v.stocks, 10),
    prices: numMap(v.prices, 12),
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
export interface SapoItem { name: string; category?: string; brand?: string; tags?: string[]; variants: ProductVariant[] }

// Khớp theo SKU phiên bản (hoặc cùng tên) → cập nhật; chưa có → tạo mới (chưa có định mức).
// Định mức + tiền công đã khai báo trong app luôn được giữ nguyên.
export function importSapo(c: Ctx, items: SapoItem[]): Result {
  if (!Array.isArray(items) || !items.length) return fail("File không có sản phẩm nào");
  if (items.length > 60) return fail("Mỗi lần gửi tối đa 60 mẫu");
  let created = 0, updated = 0;
  const skipped: string[] = [];
  // mẫu lỗi thì bỏ qua và báo lại, không chặn cả đợt
  for (const it of items) {
    const name = String(it.name ?? "").trim();
    if (!name || name.length > LIMITS.name) { skipped.push(`${name.slice(0, 40) || "(không tên)"}: tên không hợp lệ`); continue; }
    // không lưu tồn kho Sapo (web không theo dõi tồn thành phẩm theo Sapo)
    const variants = cleanVariants(it.variants).map(({ stock: _s, stocks: _ss, ...v }) => v);
    if (!variants.length) continue;
    const skus = new Set(variants.map(v => v.sku));
    // khớp theo SKU; theo tên chỉ khi là mẫu tự tạo chưa có SKU size (Sapo có nhiều mẫu trùng tên)
    const p = c.s.products.find(x => x.variants?.some(v => skus.has(v.sku)))
      ?? c.s.products.find(x => !x.variants?.length && x.source !== "sapo" && x.name.trim().toLowerCase() === name.toLowerCase());
    const verr = variantsError(c, variants, p?.id, 60);
    if (verr) { skipped.push(`${name}: ${verr}`); continue; }
    const category = String(it.category ?? "").trim().slice(0, 60) || undefined;
    const brand = String(it.brand ?? "").trim().slice(0, 60) || undefined;
    const tags = (it.tags ?? []).map(t => String(t).trim()).filter(Boolean).slice(0, 10);
    if (p) {
      Object.assign(p, { name, variants, category, brand, tags, source: "sapo", syncedAt: c.now });
      updated++;
    } else {
      let base = `M-${variants[0].sku}`.slice(0, 40);
      while (c.s.products.some(x => x.sku === base)) base = `${base.slice(0, 36)}-${c.s.seq.id++}`;
      c.s.products.push({ id: uid(c, "p"), sku: base, name, laborCost: 0, bom: [], variants, category, brand, tags, source: "sapo", syncedAt: c.now, status: "active" });
      created++;
    }
  }
  if (!created && !updated && skipped.length) return fail(`Không nhập được: ${skipped.slice(0, 3).join("; ")}`);
  return ok(`Sapo: thêm ${created} mẫu, cập nhật ${updated} mẫu${skipped.length ? `, bỏ qua ${skipped.length} (${skipped.slice(0, 3).join("; ")})` : ""}`);
}

// color: lưu định mức riêng cho màu đó (vải khác màu); bỏ trống = định mức chung
// Sửa giá bán lẻ / giá nhập hiện tại của 1 phiên bản
export function setVariantPrice(c: Ctx, productId: string, sku: string, a: { price: number; cost: number }): Result {
  const p = byId(c.s.products, productId);
  const v = p?.variants?.find(x => x.sku === sku);
  if (!p || !v) return fail("Không tìm thấy phiên bản");
  if (!(a.price >= 0) || !(a.cost >= 0) || a.price > LIMITS.price || a.cost > LIMITS.price) return fail("Giá không hợp lệ");
  v.price = a.price; v.cost = a.cost;
  return ok(`${p.name} · ${sku}: giá bán ${vnd(a.price)}, giá nhập ${vnd(a.cost)}`);
}

// Tỉ lệ cost mong muốn (vd 32%) của bảng tính giá; color: màu đang xem (có bảng riêng thì sửa bảng màu đó)
export function setCostRatio(c: Ctx, productId: string, a: { ratio: number; color?: string }): Result {
  const p = byId(c.s.products, productId);
  if (!p) return fail("Không tìm thấy sản phẩm");
  if (!(a.ratio > 0 && a.ratio < 1)) return fail("Tỉ lệ phải từ 1% đến 99%");
  const key = a.color && p.costing?.[a.color] ? a.color : "";
  const cur = p.costing?.[key] ?? { labor: p.laborCost };
  p.costing = { ...(p.costing ?? {}), [key]: { ...cur, ratio: Math.round(a.ratio * 1000) / 1000 } };
  return ok(`${p.name}${key ? ` (${key})` : ""}: tỉ lệ cost mục tiêu ${Math.round(a.ratio * 1000) / 10}%`);
}

// Sửa công may trong giá vốn dự trù (vd xưởng đổi giá); color: màu đang xem
export function setCostLabor(c: Ctx, productId: string, a: { labor: number; color?: string; workshopId: string; sewType?: string }): Result {
  const p = byId(c.s.products, productId);
  if (!p) return fail("Không tìm thấy sản phẩm");
  if (!(a.labor >= 0) || a.labor > LIMITS.labor) return fail("Công may không hợp lệ");
  const w = byId(c.s.workshops, a.workshopId);
  if (!w) return fail("Chọn xưởng may");
  const key = a.color && p.costing?.[a.color] ? a.color : "";
  const cur = p.costing?.[key] ?? { labor: p.laborCost };
  p.costing = { ...(p.costing ?? {}), [key]: { ...cur, labor: a.labor, workshop: w.id, workshopName: w.name, sewType: a.sewType?.trim().slice(0, LIMITS.name) || undefined } };
  if (!key) p.laborCost = a.labor;
  return ok(`${p.name}${key ? ` (${key})` : ""}: công may ${vnd(a.labor)} tại ${w.name}`);
}

// Sửa bảng giá gia công của xưởng
export function setWorkshopRates(c: Ctx, id: string, rates: WorkshopRate[]): Result {
  const w = byId(c.s.workshops, id);
  if (!w) return fail("Không tìm thấy xưởng");
  const list = (rates ?? []).map(r => ({ item: String(r.item ?? "").trim().slice(0, LIMITS.name), ...(r.price != null && r.price >= 0 ? { price: r.price } : {}), ...(r.minQty ? { minQty: r.minQty } : {}), ...(r.invoice ? { invoice: true } : {}), ...(r.note?.trim() ? { note: r.note.trim().slice(0, 200) } : {}) })).filter(r => r.item);
  if (list.length > 200) return fail("Tối đa 200 dòng giá");
  if (list.some(r => r.price != null && r.price > LIMITS.labor)) return fail("Giá gia công quá lớn");
  w.rates = list;
  return ok(`${w.name}: đã lưu bảng giá gia công (${list.length} dòng)`);
}

export function setProductBom(c: Ctx, id: string, a: { laborCost: number; bom: BomLine[]; color?: string }): Result {
  const p = byId(c.s.products, id);
  if (!p) return fail("Không tìm thấy sản phẩm");
  if (!(a.laborCost >= 0) || a.laborCost > LIMITS.labor) return fail("Tiền công may không hợp lệ");
  const bom = (a.bom ?? []).filter(l => l.material);
  if (!bom.length) return fail("Thêm ít nhất 1 phụ liệu vào định mức");
  if (bom.length > LIMITS.bomLines) return fail(`Định mức tối đa ${LIMITS.bomLines} phụ liệu`);
  if (bom.some(l => !(l.qtyPerUnit > 0) || l.qtyPerUnit > LIMITS.bomQty)) return fail("Định mức mỗi phụ liệu phải lớn hơn 0");
  if (new Set(bom.map(l => l.material)).size !== bom.length) return fail("Một phụ liệu bị chọn 2 lần");
  if (bom.some(l => !byId(c.s.materials, l.material))) return fail("Phụ liệu không tồn tại");
  const color = a.color?.trim();
  if (color) {
    if (!colorsOf(p).includes(color)) return fail(`Màu ${color} không có trong sản phẩm`);
    p.bomByColor = { ...(p.bomByColor ?? {}), [color]: bom };
  } else p.bom = bom;
  p.laborCost = a.laborCost;
  return ok(`${p.name}${color ? ` (${color})` : ""}: đã lưu định mức (${bom.length} phụ liệu)`);
}

// Giá nhập (giá vốn) của sản phẩm = giá vốn lệnh sản xuất mới nhất của mẫu / màu đó
function syncProductCost(c: Ctx, o: ProductionOrder) {
  const latest = c.s.orders
    .filter(x => !x.cancelled && x.product === o.product && (x.color ?? "") === (o.color ?? ""))
    .reduce<ProductionOrder | undefined>((a, x) => (!a || x.createdAt >= a.createdAt ? x : a), undefined);
  if (latest?.id !== o.id) return;
  const p = byId(c.s.products, o.product);
  for (const v of p?.variants ?? []) if (!o.color || v.color === o.color) v.cost = Math.round(o.unitCost);
}

// Chỉnh công may / giá vốn của lệnh (vd thuê xưởng ngoài may mắc hơn); lệnh mới nhất thì cập nhật giá nhập sản phẩm
export function setOrderCost(c: Ctx, orderId: string, a: { labor: number; note?: string }): Result {
  const o = getOrder(c, orderId);
  if (!o) return fail("Không tìm thấy lệnh");
  if (!(a.labor >= 0) || a.labor > LIMITS.labor) return fail("Công may không hợp lệ");
  if (tooLong(a.note, LIMITS.name)) return fail("Ghi chú quá dài");
  const old = o.unitCost;
  o.unitCost = Math.max(0, o.unitCost - (o.labor ?? 0) + a.labor);
  o.labor = a.labor;
  o.costNote = a.note?.trim() || undefined;
  syncProductCost(c, o);
  return ok(`${o.code}: giá vốn ${vnd(old)} → ${vnd(o.unitCost)}/cái`);
}

// ----- Đồng bộ file TÍNH GIÁ SP: xưởng (địa chỉ, bảng giá gia công) + bảng tính giá từng sản phẩm -----
export interface CostingFile {
  workshops: { name: string; area: string; contactName: string; phone: string; address?: string; note?: string; aliases: string[]; rates: WorkshopRate[] }[]
  costings: { product: string; color?: string; costing: Costing }[]
}
export function importCosting(c: Ctx, f: CostingFile): Result {
  if (!f.workshops?.length && !f.costings?.length) return fail("File không có dữ liệu");
  const key = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  let created = 0;
  for (const x of f.workshops ?? []) {
    const names = [x.name, ...(x.aliases ?? [])].map(key);
    let w = c.s.workshops.find(w => names.includes(key(w.name)) || (w.aliases ?? []).some(a => names.includes(key(a))));
    if (!w) { w = { id: uid(c, "w"), name: x.name.trim(), area: "", contactName: "", phone: "", active: true }; c.s.workshops.push(w); created++; }
    Object.assign(w, {
      area: x.area || w.area, contactName: x.contactName || w.contactName, phone: x.phone || w.phone,
      address: x.address || w.address, note: x.note || w.note,
      aliases: [...new Set([...(w.aliases ?? []), ...(x.aliases ?? [])])].slice(0, 20),
      rates: (x.rates ?? []).slice(0, 200),
    });
  }
  const wsOf = (name?: string) => {
    if (!name) return undefined;
    const k = key(name);
    return c.s.workshops.find(w => key(w.name) === k || (w.aliases ?? []).some(a => key(a) === k));
  };
  let n = 0;
  for (const r of f.costings ?? []) {
    const p = byId(c.s.products, r.product);
    if (!p) return fail(`Không tìm thấy sản phẩm ${r.product}`);
    if (r.color && !colorsOf(p).includes(r.color)) return fail(`${p.name} không có màu ${r.color}`);
    const w = wsOf(r.costing.workshopName);
    p.costing = { ...(p.costing ?? {}), [r.color ?? ""]: { ...r.costing, workshop: w?.id } };
    if (!r.color || !p.laborCost) p.laborCost = r.costing.labor;
    n++;
  }
  return ok(`Tính giá: ${created} xưởng mới, cập nhật ${f.workshops?.length ?? 0} xưởng, ${n} bảng giá sản phẩm`);
}

// ----- Đồng bộ file báo cáo nguyên vật liệu (danh mục, tồn đầu, nhập / xuất theo ngày, định mức) -----
export interface NvlFile {
  materials: { code: string; name: string; unit: string; category: MaterialCategory; price: number; opening: number; supplier?: string; supplierCode?: string; note?: string }[]
  moves: { code: string; type: "in" | "out"; qty: number; date: string }[] // date yyyy-mm-dd
  openingDate: string
  boms: { product: string; color?: string; lines: { code: string; qty: number }[] }[]
}
const NVL_TAG = "Đồng bộ file NVL";

export function importNvl(c: Ctx, f: NvlFile): Result {
  if (c.s.materialTxns.some(t => t.reason?.startsWith(NVL_TAG))) return fail("File NVL đã được đồng bộ trước đó");
  if (!f.materials?.length || f.materials.length > 2000 || (f.moves?.length ?? 0) > 50_000) return fail("Dữ liệu file không hợp lệ");
  const at = (d: string) => new Date(`${d}T12:00:00+07:00`);
  const byCode = new Map(c.s.materials.map(m => [m.code, m]));
  let created = 0;
  for (const x of f.materials) {
    const code = String(x.code).trim().slice(0, 30), name = String(x.name).trim().slice(0, LIMITS.name);
    if (!code || !name) return fail(`Mã / tên phụ liệu trống: ${code || name}`);
    if (!MATERIAL_CATEGORIES[x.category]) return fail(`Loại phụ liệu không hợp lệ: ${code}`);
    let m = byCode.get(code);
    if (!m) {
      m = { id: uid(c, "m"), code, category: x.category, name, unit: x.unit, stock: 0, avgPrice: 0, totalImportQty: 0, totalImportCost: 0, minStock: 0, status: "active" };
      c.s.materials.push(m); byCode.set(code, m); created++;
    }
    Object.assign(m, { name, unit: x.unit, category: x.category, supplier: x.supplier || undefined, supplierCode: x.supplierCode || undefined, note: x.note || undefined });
    // tồn đầu kỳ: tính như 1 lần nhập theo giá hiện tại để có giá bình quân
    if (x.opening > 0) {
      applyImport(m, x.opening, x.price);
      c.s.materialTxns.push({ id: uid(c, "t"), material: m.id, type: "adjust", qty: x.opening, price: x.price, reason: `${NVL_TAG}: tồn đầu kỳ`, stockAfter: m.stock, avgAfter: m.avgPrice, by: c.me, at: at(f.openingDate) });
    }
  }
  const price = new Map(f.materials.map(x => [String(x.code).trim(), x.price]));
  const moves = [...f.moves].sort((a, b) => a.date.localeCompare(b.date));
  for (const mv of moves) {
    const m = byCode.get(mv.code);
    if (!m) return fail(`Mã ${mv.code} không có trong danh mục`);
    if (!(mv.qty > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(mv.date)) return fail(`Dòng ${mv.code} ngày ${mv.date} không hợp lệ`);
    if (mv.type === "in") applyImport(m, mv.qty, price.get(mv.code) ?? 0); else applyIssue(m, mv.qty);
    c.s.materialTxns.push({ id: uid(c, "t"), material: m.id, type: mv.type, qty: mv.qty, ...(mv.type === "in" ? { price: price.get(mv.code) ?? 0 } : {}), reason: NVL_TAG, stockAfter: m.stock, avgAfter: m.avgPrice, by: c.me, at: at(mv.date) });
  }
  // mã có giá trong file nhưng chưa từng nhập → lấy giá file làm giá bình quân ban đầu
  for (const x of f.materials) { const m = byCode.get(String(x.code).trim()); if (m && !m.avgPrice && x.price > 0) m.avgPrice = x.price; }
  // tồn âm (file ghi xuất nhiều hơn nhập) giữ nguyên như file, chỉ báo lại để kiểm tra
  // tồn kho không được âm: file ghi xuất nhiều hơn nhập thì đưa về 0, ghi lại để kiểm tra
  const negative = [...new Set(byCode.values())].filter(m => m.stock < 0);
  for (const m of negative) {
    c.s.materialTxns.push({ id: uid(c, "t"), material: m.id, type: "adjust", qty: -m.stock, reason: `${NVL_TAG}: tồn âm ${nf(m.stock, 1)} đưa về 0`, stockAfter: 0, avgAfter: m.avgPrice, by: c.me, at: c.now });
    m.stock = 0;
  }
  let boms = 0;
  for (const b of f.boms ?? []) {
    const p = byId(c.s.products, b.product);
    if (!p) return fail(`Không tìm thấy sản phẩm ${b.product}`);
    const lines = b.lines.map(l => ({ material: byCode.get(l.code)?.id ?? "", qtyPerUnit: l.qty })).filter(l => l.material && l.qtyPerUnit > 0);
    if (!lines.length) continue;
    if (b.color) {
      if (!colorsOf(p).includes(b.color)) return fail(`${p.name} không có màu ${b.color}`);
      p.bomByColor = { ...(p.bomByColor ?? {}), [b.color]: lines };
    } else p.bom = lines;
    boms++;
  }
  return ok(`NVL: ${created} phụ liệu mới, ${moves.length} lần nhập / xuất, ${boms} định mức${negative.length ? `, ${negative.length} mã tồn âm đưa về 0` : ""}`);
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
  // nhà cung cấp phải có trong danh sách Xưởng may & NCC
  if (a.supplier.trim() && !c.s.workshops.some(w => w.name === a.supplier.trim())) return fail(`${a.supplier} chưa có trong Xưởng may & NCC, thêm ở trang đó trước`);
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
    const r = importMaterial(c, { materialId: id, qty: l.qty, price: l.price, supplier: a.supplier }, true);
    if (!r.ok) return fail(row + r.error);
  }
  const created = a.lines.filter(l => l.newMaterial).length;
  // ghi rõ nhập từ nhà cung cấp nào
  const sup = a.supplier.trim() || "không ghi nhà cung cấp";
  const total = a.lines.reduce((t, l) => t + l.qty * l.price, 0);
  notify(c, ["quanly", "kho"], `📥 Nhập kho từ ${sup}: ${[...ids].map(id => { const m = byId(c.s.materials, id)!; const l = a.lines.find(x => (x.materialId ?? "") === id); return `${m.code} ${m.name}${l ? ` ${nf(l.qty, 2)} ${m.unit}` : ""}`; }).join(", ")} · tổng ${vnd(total)}.`);
  notifyWaiting(c, [...ids]);
  return ok(`Đã nhập kho ${a.lines.length} dòng từ ${sup}${created ? `, thêm ${created} phụ liệu mới` : ""}`);
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
export function createOrder(c: Ctx, a: { productId: string; workshopId: string; sizes: SizeQty[]; dueDate: string; color?: string; code?: string; group?: string }): Result {
  const sizes = a.sizes.map(x => ({ size: x.size.trim().toUpperCase(), qty: x.qty })).filter(x => x.size && x.qty);
  if (!sizes.length) return fail("Nhập số lượng ít nhất 1 size");
  if (sizes.some(x => !isInt(x.qty) || x.qty < 0)) return fail("Số lượng mỗi size phải là số nguyên");
  if (new Set(sizes.map(x => x.size)).size !== sizes.length) return fail("Size bị trùng");
  if (sizes.length > LIMITS.sizes) return fail(`Tối đa ${LIMITS.sizes} size`);
  if (sizes.some(x => x.size.length > 10)) return fail("Tên size quá dài");
  const qty = sizes.reduce((t, x) => t + x.qty, 0);
  if (qty > LIMITS.orderQty) return fail(`Một lệnh tối đa ${nf(LIMITS.orderQty)} cái`);
  const p0 = byId(c.s.products, a.productId);
  if (!p0) return fail("Chọn sản phẩm");
  if (p0.status !== "active") return fail(`${p0.sku} đang ${PRODUCT_STATUS[p0.status].toLowerCase()}, không tạo lệnh được`);
  const colors = colorsOf(p0);
  const color = a.color?.trim() || (colors.length === 1 ? colors[0] : undefined);
  if (colors.length > 1 && !color) return fail("Sản phẩm có nhiều màu, chọn màu cho lệnh");
  if (color && colors.length && !colors.includes(color)) return fail(`Màu ${color} không có trong sản phẩm`);
  // định mức đúng màu của lệnh
  const p = forColor(p0, color);
  const bad = unusableMaterials(p, c.s.materials);
  if (bad.length) return fail(`Phụ liệu ${bad.map(m => `${m.code} (${MATERIAL_STATUS[m.status].toLowerCase()})`).join(", ")} không dùng được cho lệnh mới`);
  if (!p.bom.length) return fail(`${p.name}${color ? ` (${color})` : ""} chưa có định mức phụ liệu, khai báo ở trang Sản phẩm trước`);
  const ws = byId(c.s.workshops, a.workshopId);
  if (!ws) return fail("Chọn xưởng");
  if (!ws.active) return fail(`${ws.name} đã ngừng hợp tác`);
  if (ws.kind === "ncc") return fail(`${ws.name} là nhà cung cấp, không giao lệnh may được`);
  // Ngày dự kiến hoàn thành (yyyy-mm-dd), hết hạn lúc 23:59 giờ Việt Nam ngày đó
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.dueDate)) return fail("Chọn ngày dự kiến hoàn thành");
  const dueAt = new Date(`${a.dueDate}T23:59:59+07:00`);
  if (isNaN(dueAt.getTime())) return fail("Ngày dự kiến không hợp lệ");
  if (dueAt < c.now) return fail("Ngày dự kiến phải từ hôm nay trở đi");
  if (dueAt.getTime() > c.now.getTime() + LIMITS.dueDays * DAY) return fail("Ngày dự kiến quá xa (tối đa 1 năm)");
  const code = a.code ?? `LSX-${String(c.s.seq.order++).padStart(4, "0")}`;
  const o: ProductionOrder = {
    id: code, code, product: p.id, workshop: a.workshopId, qty, sizes, color, step: "cut", pendingIssue: true, ...(a.group ? { group: a.group } : {}),
    unitCost: unitCost(p0, c.s.materials, color), loss: 0, lossApproved: false, batches: [],
    createdBy: c.me, createdAt: c.now, dueAt,
  };
  o.labor = costBreakdown(p0, c.s.materials, color).labor;
  c.s.orders.push(o);
  syncProductCost(c, o);
  if (!a.group) notify(c, ["quanly", "kho"], `🆕 Lệnh ${code}: ${p.name} × ${qty} (${sizes.map(x => `${x.size}:${x.qty}`).join(" ")})\nGiao ${wsName(c.s, a.workshopId)}, hạn ${fmtD(o.dueAt)}.\nChờ kho xuất phụ liệu.`);
  return ok(`Đã tạo ${code}, chờ xuất phụ liệu`, code);
}

// 1 lệnh = 1 xưởng, nhiều sản phẩm: mỗi sản phẩm (màu) là 1 dòng LSX-0005-1, -2…; 1 sản phẩm thì giữ LSX-0005
export function createOrders(c: Ctx, a: { workshopId: string; dueDate: string; items: { productId: string; color?: string; sizes: SizeQty[] }[] }): Result {
  const items = (a.items ?? []).filter(x => x.productId);
  if (!items.length) return fail("Thêm ít nhất 1 sản phẩm");
  if (items.length > LIMITS.lines) return fail(`Một lệnh tối đa ${LIMITS.lines} sản phẩm`);
  const keys = items.map(x => `${x.productId}|${x.color ?? ""}`);
  if (new Set(keys).size !== keys.length) return fail("Một sản phẩm (cùng màu) bị thêm 2 lần");
  const group = `LSX-${String(c.s.seq.order++).padStart(4, "0")}`;
  const lines: string[] = [];
  for (const [i, it] of items.entries()) {
    const code = items.length > 1 ? `${group}-${i + 1}` : group;
    const r = createOrder(c, { ...it, workshopId: a.workshopId, dueDate: a.dueDate, code, ...(items.length > 1 ? { group } : {}) });
    if (!r.ok) return fail(items.length > 1 ? `Dòng ${i + 1}: ${r.error}` : r.error);
    const o = byId(c.s.orders, code)!;
    lines.push(`${prodOf(c.s, o).name}${o.color ? ` ${o.color}` : ""} × ${o.qty}`);
  }
  if (items.length > 1) notify(c, ["quanly", "kho"], `🆕 Lệnh ${group} (${items.length} sản phẩm) giao ${wsName(c.s, a.workshopId)}:\n${lines.join("\n")}\nChờ kho xuất phụ liệu.`);
  return ok(`Đã tạo ${group}${items.length > 1 ? ` (${items.length} sản phẩm)` : ""}, chờ xuất phụ liệu`, items.length > 1 ? `${group}-1` : group);
}

// Xuất phụ liệu cho các dòng lệnh chưa xuất (thường là cả lệnh); thiếu mã nào thì báo, không trừ gì
// Xuất phụ liệu, được xuất từng phần: materialIds = các mã muốn gửi lần này (bỏ trống = tất cả phần còn lại).
// Xuất đủ mọi mã theo định mức thì lệnh hết "chưa xuất phụ liệu".
export function issueMaterials(c: Ctx, orderIds: string[], materialIds?: string[]): Result {
  const orders = (orderIds ?? []).map(id => getOrder(c, id)).filter((o): o is ProductionOrder => !!o && !!o.pendingIssue);
  if (!orders.length) return fail("Không có dòng lệnh nào chờ xuất phụ liệu");
  const only = materialIds?.length ? new Set(materialIds) : null;
  const nb = orders.filter(o => !bomOf(prodOf(c.s, o), o.color).length);
  if (nb.length) return fail(`${nb.map(x => x.code).join(", ")} chưa có định mức phụ liệu`);
  const per = orders.map(o => ({ o, rest: remainingIssue(c.s, o).filter(r => r.qty > 0 && (!only || only.has(r.material.id))) }));
  const total = new Map<string, number>();
  for (const { rest } of per) for (const r of rest) total.set(r.material.id, (total.get(r.material.id) ?? 0) + r.qty);
  if (!total.size) return fail("Không có mục nào cần xuất");
  const short = [...total].map(([id, q]) => ({ m: byId(c.s.materials, id)!, q: round2(q) })).filter(x => x.q > x.m.stock + 1e-9);
  if (short.length) return fail(`Không đủ phụ liệu: ${short.map(x => `${x.m.code} cần ${nf(x.q, 1)}, còn ${nf(x.m.stock, 1)} ${x.m.unit}`).join("; ")}`);
  for (const { o, rest } of per) {
    for (const r of rest) {
      applyIssue(r.material, r.qty);
      c.s.materialTxns.push({ id: uid(c, "t"), material: r.material.id, type: "out", qty: r.qty, order: o.code, stockAfter: r.material.stock, avgAfter: r.material.avgPrice, by: c.me, at: tick(c) });
    }
    if (rest.length) { o.issuedAt ??= c.now; o.issuedBy ??= c.me; }
    if (!remainingIssue(c.s, o).some(r => r.qty > 0)) {
      o.pendingIssue = false;
      // xuất đủ: chốt lại giá vốn theo giá BQ lúc xuất (giữ công may đã chỉnh tay)
      const b = costBreakdown(prodOf(c.s, o), c.s.materials, o.color);
      o.unitCost = Math.round(b.total - b.labor + (o.labor ?? b.labor));
      syncProductCost(c, o);
    }
  }
  for (const id of total.keys()) checkLow(c, byId(c.s.materials, id)!);
  const name = orders[0].group ?? orders.map(o => o.code).join(", ");
  const left = orders.filter(o => o.pendingIssue).length;
  notify(c, ["quanly", "kho"], `📤 Đã xuất phụ liệu cho ${name}: ${[...total].map(([id, q]) => { const m = byId(c.s.materials, id)!; return `${m.code} ${nf(q, 1)} ${m.unit}`; }).join(", ")}${left ? ". Còn phụ liệu chưa xuất." : "."}`);
  return ok(`Đã xuất ${total.size} mã phụ liệu${left ? ", còn phần chưa xuất" : ", đã đủ theo định mức"}`);
}

export function confirmCut(c: Ctx, orderId: string): Result {
  const o = getOrder(c, orderId);
  if (!o || o.step !== "cut") return fail("Lệnh không ở bước chờ cắt");
  // chưa xuất đủ phụ liệu theo định mức thì chưa cho may
  if (o.pendingIssue) return fail(o.issuedAt ? "Chưa xuất đủ phụ liệu, xuất nốt phần còn lại rồi xưởng mới nhận và may" : "Chưa xuất phụ liệu cho lệnh này, bấm Xuất phụ liệu trước");
  o.step = "sew";
  event(c, "issue", o, o.qty);
  notify(c, ["quanly", "kho"], `✂️ ${o.code}: ${wsName(c.s, o.workshop)} đã nhận nguyên phụ liệu, bắt đầu may ${o.qty} cái.`);
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
  // qty = tổng hao hụt của lệnh (đặt lại được, 0 = không hao hụt)
  const max = b.notReturned + o.loss;
  if (!isInt(qty) || qty < 0 || qty > max) return fail(`Nhập từ 0 đến ${max}`);
  const diff = qty - o.loss;
  o.loss = qty;
  o.lossApproved = false;
  if (diff > 0) event(c, "loss", o, diff);
  if (qty === 0) { notify(c, ["quanly", "kho"], `✅ ${o.code}: ${wsName(c.s, o.workshop)} không hao hụt.`); return ok("Đã ghi: không hao hụt"); }
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
      const p = forColor(prodOf(c.s, o), o.color);
      const deltas = p.bom.map(b => ({ m: byId(c.s.materials, b.material)!, d: Math.round(b.qtyPerUnit * (qty - o.qty) * 100) / 100 }));
      if (o.pendingIssue) deltas.length = 0; // chưa xuất phụ liệu: chỉ đổi số lượng
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

// Số lượng phiếu sửa theo size (phiếu cũ không có size thì gộp 1 dòng "—")
export function repairSizes(r: RepairTicket) {
  const m = new Map<string, number>();
  for (const it of r.items?.length ? r.items : [{ size: "—", qty: r.qty }]) m.set(it.size, (m.get(it.size) ?? 0) + it.qty);
  return [...m].map(([size, qty]) => ({ size, qty, back: (r.backSizes ?? []).filter(x => x.size === size).reduce((t, x) => t + x.qty, 0) }));
}

// Xưởng trả hàng sửa theo size, trả nhiều đợt được; trả đủ mọi size thì chuyển chờ QC lại
export function repairReturn(c: Ctx, id: string, sizes: { size: string; qty: number }[]): Result {
  const r = byId(c.s.repairs, id);
  if (!r) return fail("Không tìm thấy phiếu");
  if (r.status !== "received") return fail("Xưởng chưa nhận phiếu này");
  const rows = repairSizes(r);
  const got = (sizes ?? []).filter(x => x.qty > 0);
  if (!got.length) return fail("Nhập số trả lại ít nhất 1 size");
  for (const x of got) {
    const row = rows.find(y => y.size === x.size);
    if (!row) return fail(`Phiếu không có size ${x.size}`);
    if (!isInt(x.qty) || x.qty > row.qty - row.back) return fail(`Size ${x.size} chỉ còn ${row.qty - row.back} cái chưa trả`);
  }
  r.backSizes = [...(r.backSizes ?? []), ...got.map(x => ({ size: x.size, qty: x.qty }))];
  const total = got.reduce((t, x) => t + x.qty, 0);
  const left = repairSizes(r).reduce((t, x) => t + x.qty - x.back, 0);
  r.history.push({ at: tick(c), by: c.me, text: `Xưởng trả ${got.map(x => `${x.size} ${x.qty}`).join(", ")}${left ? ` (còn ${left} cái chưa trả)` : ", đã đủ"}` });
  if (left > 0) return ok(`${r.code}: đã nhận ${total} cái, còn ${left} cái chưa trả`);
  r.status = "returned";
  const o = getOrder(c, r.order)!;
  event(c, "back", o, r.qty, r.round);
  notify(c, ["qc"], `🔁 ${wsName(c.s, r.workshop)} đã trả đủ ${r.qty} cái của phiếu ${r.code}, chờ QC lại.`);
  return ok(`${r.code}: đã trả đủ, chờ QC lại`);
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
const ROLE_NAME: Record<Role, string> = { quanly: "Quản lý kho", kho: "Phó kho", qc: "QC", sale: "Sale cửa hàng" };

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
  if (!["quanly", "kho", "qc", "sale"].includes(a.role)) return fail("Quyền không hợp lệ");
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
  createCustomerRepair: ["customer.repair", createCustomerRepair, "Sale gửi yêu cầu sửa đồ khách"],
  receiveCustomerRepair: ["customer.qc", receiveCustomerRepair, "QC nhận đồ khách từ sale"],
  sendCustomerRepair: ["customer.qc", sendCustomerRepair, "Gửi đồ khách cho xưởng"],
  customerRepairBack: ["customer.qc", customerRepairBack, "Xưởng trả đồ khách, QC kiểm tra"],
  customerRepairDone: ["customer.qc", customerRepairDone, "QC trả đồ khách cho sale"],
  storeConfirmCustomerRepair: ["customer.repair", storeConfirmCustomerRepair, "Cửa hàng kiểm tra, xác nhận nhập SON"],
  noteCustomerRepair: ["customer.repair", noteCustomerRepair, "Ghi chú đồ khách"],
  createProduct: ["product.manage", createProduct, "Thêm sản phẩm"],
  setProductStatus: ["product.manage", setProductStatus, "Đổi tình trạng sản phẩm"],
  setProductVariants: ["product.manage", setProductVariants, "Sửa size + SKU sản phẩm"],
  importSapo: ["product.manage", importSapo, "Nhập sản phẩm từ Sapo"],
  importCosting: ["user.manage", importCosting, "Đồng bộ file tính giá"],
  importNvl: ["user.manage", importNvl, "Đồng bộ file nguyên vật liệu"],
  updateMaterial: ["material.manage", updateMaterial, "Sửa phụ liệu"],
  setVariantPrice: ["product.manage", setVariantPrice, "Sửa giá phiên bản"],
  setMaterialImage: ["material.manage", setMaterialImage, "Ảnh phụ liệu"],
  adjustMaterial: ["material.manage", adjustMaterial, "Sửa tồn / giá BQ phụ liệu"],
  deleteMaterial: ["material.manage", deleteMaterial, "Xóa phụ liệu"],
  setOrderCost: ["order.create", setOrderCost, "Chỉnh giá vốn lệnh"],
  createOrders: ["order.create", createOrders, "Tạo lệnh sản xuất"],
  issueMaterials: ["order.create", issueMaterials, "Xuất phụ liệu cho lệnh"],
  setCostRatio: ["product.manage", setCostRatio, "Sửa tỉ lệ cost mục tiêu"],
  repairReturn: ["repair.status", repairReturn, "Nhận hàng sửa xưởng trả theo size"],
  setCostLabor: ["product.manage", setCostLabor, "Sửa công may"],
  setWorkshopRates: ["workshop.manage", setWorkshopRates, "Sửa bảng giá gia công"],
  setProductBom: ["product.manage", setProductBom, "Sửa định mức sản phẩm"],
  createOrder: ["order.create", createOrder, "Tạo lệnh sản xuất"],
  confirmCut: ["order.cut", confirmCut, "Xưởng đã nhận nguyên phụ liệu"],
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
