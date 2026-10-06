import type { Costing, ItemStatus, Material, MaterialCategory, Product } from './types'
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

// Định mức theo màu: có định mức riêng của màu đó thì dùng, không thì dùng định mức chung
export function bomOf(p: Product, color?: string) {
  const own = color ? p.bomByColor?.[color] : undefined
  return own?.length ? own : p.bom
}
// Sản phẩm "nhìn theo 1 màu": các hàm tính định mức / giá vốn dùng đúng vải của màu đó
export const forColor = (p: Product, color?: string): Product => ({ ...p, bom: bomOf(p, color) })
export const hasBom = (p: Product) => p.bom.length > 0 || Object.values(p.bomByColor ?? {}).some(l => l.length > 0)
// Màu của mẫu (theo phiên bản Sapo)
export const colorsOf = (p: Product) => [...new Set((p.variants ?? []).map(v => v.color).filter((x): x is string => !!x))]

// Phần phụ liệu còn phải xuất cho 1 dòng lệnh = định mức × số lượng − đã xuất (trừ phần hoàn kho)
export function remainingIssue(s: { products: Product[]; materials: Material[]; materialTxns: { material: string; type: string; qty: number; order?: string }[] }, o: { code: string; product: string; color?: string; qty: number }) {
  const p = byId(s.products, o.product)
  if (!p) return []
  const issued = new Map<string, number>()
  for (const t of s.materialTxns) if (t.order === o.code) {
    if (t.type === 'out') issued.set(t.material, (issued.get(t.material) ?? 0) + t.qty)
    else if (t.type === 'adjust') issued.set(t.material, (issued.get(t.material) ?? 0) - t.qty)
  }
  return bomOf(p, o.color).map(b => {
    const m = byId(s.materials, b.material)!
    const need = round2(b.qtyPerUnit * o.qty), done = round2(issued.get(b.material) ?? 0)
    return { material: m, need, issued: done, qty: round2(Math.max(0, need - done)) }
  }).filter(r => r.material)
}

// Phụ liệu cần chuẩn bị: tổng định mức của các lệnh chưa xuất phụ liệu (không tách theo xưởng)
export function materialForecast(products: Product[], materials: Material[], orders: { code: string; product: string; color?: string; qty: number; cancelled?: unknown; pendingIssue?: boolean }[], materialTxns: { material: string; type: string; qty: number; order?: string }[] = []) {
  const need = new Map<string, number>()
  for (const o of orders) {
    if (o.cancelled || !o.pendingIssue) continue
    for (const r of remainingIssue({ products, materials, materialTxns }, o)) if (r.qty > 0) need.set(r.material.id, (need.get(r.material.id) ?? 0) + r.qty)
  }
  return [...need].map(([id, qty]) => {
    const m = byId(materials, id)
    return m ? { material: m, need: round2(qty), short: round2(Math.max(0, qty - m.stock)) } : null
  }).filter((x): x is { material: Material; need: number; short: number } => !!x).sort((a, b) => b.short - a.short || b.need - a.need)
}

// Phụ liệu không ở trạng thái "đang dùng" thì không dùng cho lệnh mới
export function unusableMaterials(product: Product, materials: Material[]) {
  return product.bom.map(b => byId(materials, b.material)!).filter(m => m.status !== "active")
}

export const DEFECTS = ['Bỏ mũi', 'Đường may lệch', 'Dơ, ố', 'Sai thông số', 'Thiếu nút', 'Lỗi khác']

// Giá BQ sau mỗi lần nhập, tính trên phần còn trong kho:
// giá mới = (tồn hiện tại × giá BQ cũ + số nhập × giá nhập) ÷ (tồn + số nhập). Tồn ≤ 0 thì lấy giá nhập.
export function movingAvg(stock: number, avg: number, qty: number, price: number) {
  const base = Math.max(0, stock)
  return base + qty > 0 ? (base * avg + qty * price) / (base + qty) : price
}
export function applyImport(material: Material, qty: number, price: number) {
  material.avgPrice = movingAvg(material.stock, material.avgPrice, qty, price)
  material.totalImportQty += qty
  material.totalImportCost += qty * price
  material.stock = round2(material.stock + qty)
}

// Xuất kho chỉ giảm tồn, không đổi giá BQ
export function applyIssue(material: Material, qty: number) {
  material.stock = round2(material.stock - qty)
}

// Giá BQ nếu nhập thêm (để hiện trước khi bấm)
export function previewAvg(material: Material, qty: number, price: number) {
  return movingAvg(material.stock, material.avgPrice, qty, price)
}

export function needFor(product: Product, qty: number, materials: Material[]) {
  return product.bom.map(b => ({ material: byId(materials, b.material)!, qty: round2(b.qtyPerUnit * qty) }))
}

export function shortages(product: Product, qty: number, materials: Material[]) {
  return needFor(product, qty, materials).filter(n => n.qty > n.material.stock)
}

export function materialCost(product: Product, materials: Material[]) {
  return sum(product.bom, b => b.qtyPerUnit * (byId(materials, b.material)?.avgPrice ?? 0))
}

// ----- Tính giá (công thức giống file TÍNH GIÁ SP) -----
export function costingOf(p: Product, color?: string): Costing | undefined {
  const c = p.costing
  if (!c) return undefined
  return (color ? c[color] : undefined) ?? c[""] ?? (color ? undefined : Object.values(c)[0])
}
export const accTotal = (c?: Costing) => (c ? (c.acc?.tag ?? 0) + (c.acc?.logo ?? 0) + (c.acc?.extra ?? 0) + (c.acc?.buttons ?? 0) + (c.acc?.fusing ?? 0) + (c.other ?? 0) : 0)
export const fileFabric = (c?: Costing) => (c ? (c.fabric ? c.fabric.qty * c.fabric.price : 0) + (c.lining ? c.lining.qty * c.lining.price : 0) : 0)

export interface CostBreakdown {
  fabric: number // vải chính + lót (+ phụ liệu kho nếu định mức có)
  fabricFrom: "bom" | "file" | "none" // định mức kho × giá BQ, hoặc định lượng × giá trong file tính giá
  labor: number
  acc: number // phụ liệu theo file tính giá (tag, logo, cúc, ép keo, khác)
  total: number
  costing?: Costing
}
// Giá vốn 1 cái = vải (định mức kho, chưa có thì theo file) + công may + phụ liệu
export function costBreakdown(p: Product, materials: Material[], color?: string): CostBreakdown {
  const bom = bomOf(p, color)
  const c = costingOf(p, color)
  const fromBom = bom.length > 0
  const fabric = fromBom ? sum(bom, b => b.qtyPerUnit * (byId(materials, b.material)?.avgPrice ?? 0)) : fileFabric(c)
  // định mức kho đã có cúc (có giá) thì không cộng tiền cúc của file nữa
  const bomHasButtons = fromBom && bom.some(b => { const m = byId(materials, b.material); return m?.category === 'nut' && m.avgPrice > 0 })
  const acc = Math.max(0, accTotal(c) - (bomHasButtons ? c?.acc?.buttons ?? 0 : 0))
  const labor = c?.labor ?? p.laborCost
  return { fabric, fabricFrom: fromBom ? "bom" : c ? "file" : "none", labor, acc, total: fabric + labor + acc, costing: c }
}
// Giá bán theo công thức file: giá vốn ÷ tỉ lệ cost mong muốn × 1,08 (VAT)
export const formulaPrice = (cost: number, ratio?: number) => (ratio ? (cost / ratio) * 1.08 : 0)
// Tỉ lệ cost thực tế = giá vốn ÷ (giá bán ÷ 1,08)
export const costRatio = (cost: number, price?: number) => (price ? cost / (price / 1.08) : 0)

// giáVốn = Σ(định mức × giá BQ) + tiền công may
export function unitCost(product: Product, materials: Material[], color?: string) {
  return costBreakdown(product, materials, color).total
}

// Ngưỡng báo đủ (nếu chưa đặt thì lấy 130% ngưỡng báo hết)
export const okLevel = (m: Material) => m.okStock ?? Math.ceil(m.minStock * 1.3)

// Mức tồn: hết (≤ 0, đỏ) · sắp hết (trên 0 đến 10, cam) · đủ
export const LOW_STOCK = 10
export type StockLevel = 'out' | 'low' | 'ok'
export function stockLevel(m: Material): StockLevel {
  if (m.stock <= 0) return 'out'
  if (m.stock <= LOW_STOCK) return 'low'
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
// Giá vốn hiển thị: theo định mức / file tính giá; mẫu nhiều màu lấy màu đầu tiên có số liệu; chưa có gì thì giá nhập Sapo
export function displayColor(p: Product) {
  if (p.bom.length || p.costing?.[""]) return undefined
  return Object.keys(p.bomByColor ?? {}).find(k => p.bomByColor![k].length) ?? Object.keys(p.costing ?? {})[0]
}
export function costOf(p: Product, materials: Material[]) {
  const b = costBreakdown(p, materials, displayColor(p))
  return b.fabricFrom === "none" && !b.labor ? sapoCost(p) : b.total
}
// Khoảng giá (vd giá bán lẻ khác nhau giữa các size)
export function priceRange(vals: (number | undefined)[]): [number, number] | null {
  const xs = vals.filter((x): x is number => typeof x === 'number' && x > 0)
  return xs.length ? [Math.min(...xs), Math.max(...xs)] : null
}
