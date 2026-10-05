import type { ItemStatus, Material, MaterialCategory, Product } from './types'
import { byId, round2, sum } from './util'

export const MATERIAL_CATEGORIES: Record<MaterialCategory, string> = {
  vai: "Vải", nut: "Nút", chi: "Chỉ", nhan: "Tag / nhãn", khoa: "Khóa kéo", khac: "Phụ liệu khác",
}
export const UNITS = ["mét", "cái", "cuộn", "kg", "bộ", "sợi"]

// Mã tự sinh theo loại: VAI-01, NUT-02… (số tiếp theo trong loại đó)
export const CODE_PREFIX: Record<MaterialCategory, string> = {
  vai: "VAI", nut: "NUT", chi: "CHI", nhan: "NHAN", khoa: "KHOA", khac: "PL",
}
export const DEFAULT_UNIT: Record<MaterialCategory, string> = {
  vai: "mét", nut: "cái", chi: "cuộn", nhan: "cái", khoa: "cái", khac: "cái",
}
// extra = số mã cùng loại đang chờ tạo (vd nhiều dòng mới trong một phiếu)
export function nextMaterialCode(category: MaterialCategory, materials: Material[], extra = 0) {
  const prefix = CODE_PREFIX[category]
  const re = new RegExp(`^${prefix}-(\\d+)$`)
  const max = materials.reduce((m, x) => Math.max(m, Number(re.exec(x.code)?.[1] ?? 0)), 0)
  return `${prefix}-${String(max + 1 + extra).padStart(2, "0")}`
}

export const MATERIAL_STATUS: Record<ItemStatus, string> = {
  active: "Đang dùng", paused: "Tạm ngưng", discontinued: "Ngừng dùng",
}
export const PRODUCT_STATUS: Record<ItemStatus, string> = {
  active: "Đang sản xuất", paused: "Tạm ngưng", discontinued: "Ngừng sản xuất",
}

// Phụ liệu không ở trạng thái "đang dùng" thì không dùng cho lệnh mới
export function unusableMaterials(product: Product, materials: Material[]) {
  return product.bom.map(b => byId(materials, b.material)!).filter(m => m.status !== "active")
}

export const DEFECTS = ['Bỏ mũi', 'Đường may lệch', 'Dơ, ố', 'Sai thông số', 'Thiếu nút', 'Lỗi khác']

// Giá BQ = tổng tiền các lần nhập ÷ tổng số lượng các lần nhập
export function applyImport(material: Material, qty: number, price: number) {
  material.totalImportQty += qty
  material.totalImportCost += qty * price
  material.avgPrice = material.totalImportCost / material.totalImportQty
  material.stock = round2(material.stock + qty)
}

// Xuất kho chỉ giảm tồn, không đổi giá BQ
export function applyIssue(material: Material, qty: number) {
  material.stock = round2(material.stock - qty)
}

// Giá BQ nếu nhập thêm (để hiện trước khi bấm)
export function previewAvg(material: Material, qty: number, price: number) {
  const tq = material.totalImportQty + qty
  return tq ? (material.totalImportCost + qty * price) / tq : 0
}

export function needFor(product: Product, qty: number, materials: Material[]) {
  return product.bom.map(b => ({ material: byId(materials, b.material)!, qty: round2(b.qtyPerUnit * qty) }))
}

export function shortages(product: Product, qty: number, materials: Material[]) {
  return needFor(product, qty, materials).filter(n => n.qty > n.material.stock)
}

export function materialCost(product: Product, materials: Material[]) {
  return sum(product.bom, b => b.qtyPerUnit * byId(materials, b.material)!.avgPrice)
}

// giáVốn = Σ(định mức × giá BQ) + tiền công may
export function unitCost(product: Product, materials: Material[]) {
  return materialCost(product, materials) + product.laborCost
}

// Ngưỡng báo đủ (nếu chưa đặt thì lấy 130% ngưỡng báo hết)
export const okLevel = (m: Material) => m.okStock ?? Math.ceil(m.minStock * 1.3)

export type StockLevel = 'low' | 'near' | 'ok'
export function stockLevel(m: Material): StockLevel {
  if (m.status === "discontinued") return "ok"
  if (m.stock < m.minStock) return 'low'
  if (m.stock < okLevel(m)) return 'near'
  return 'ok'
}

// ----- Số liệu Sapo của một mẫu -----
// Tồn Sapo = cộng tồn mọi phiên bản (mọi chi nhánh)
export const sapoStock = (p: Product) => (p.variants ?? []).reduce((t, v) => t + (v.stock ?? 0), 0)
// Giá trị tồn Sapo = Σ tồn × giá nhập từng phiên bản
export const sapoValue = (p: Product) => (p.variants ?? []).reduce((t, v) => t + (v.stock ?? 0) * (v.cost ?? 0), 0)
// Giá nhập Sapo đại diện (bình quân các phiên bản có giá)
export function sapoCost(p: Product) {
  const cs = (p.variants ?? []).map(v => v.cost ?? 0).filter(x => x > 0)
  return cs.length ? cs.reduce((a, b) => a + b, 0) / cs.length : 0
}
// Giá vốn dùng hiển thị: có định mức thì tính theo định mức, chưa có thì lấy giá nhập Sapo
export const costOf = (p: Product, materials: Material[]) => (p.bom.length ? unitCost(p, materials) : sapoCost(p))
// Khoảng giá (vd giá bán lẻ khác nhau giữa các size)
export function priceRange(vals: (number | undefined)[]): [number, number] | null {
  const xs = vals.filter((x): x is number => typeof x === 'number' && x > 0)
  return xs.length ? [Math.min(...xs), Math.max(...xs)] : null
}
