import type { ProductionOrder, RepairTicket } from './types'
import { sum } from './util'

export const LOSS_ALLOWED = 0.02
export const REPAIR_DUE_DAYS = 3

export interface Balance {
  received: number
  pendingQC: number
  pass: number
  scrap: number
  inRepair: number
  notReturned: number
  loss: number
}

// repairs: các phiếu sửa của lệnh này
export function calcBalance(order: ProductionOrder, repairs: RepairTicket[]): Balance {
  const qcd = order.batches.filter(b => b.qc)
  const closed = repairs.filter(r => r.requc)
  const received = sum(order.batches, b => b.received)
  const pendingQC = sum(order.batches.filter(b => !b.qc), b => b.received)
  const pass = sum(qcd, b => b.qc!.pass) + sum(closed, r => r.requc!.pass)
  const scrap = sum(qcd, b => b.qc!.vai + b.qc!.hong) + sum(closed, r => r.requc!.hong)
  const inRepair = sum(repairs.filter(r => r.status !== 'closed'), r => r.qty)
  const notReturned = order.qty - received - order.loss
  return { received, pendingQC, pass, scrap, inRepair, notReturned, loss: order.loss }
}

// số giao = pass + chờ QC + đang sửa + loại + hao hụt + chưa trả
export function isBalanced(order: ProductionOrder, b: Balance) {
  return order.qty === b.pass + b.pendingQC + b.inRepair + b.scrap + b.loss + b.notReturned
}

export function canClose(order: ProductionOrder, b: Balance) {
  return b.notReturned === 0 && b.pendingQC === 0 && b.inRepair === 0
    && (order.loss === 0 || order.lossApproved)
}

export function closeChecklist(order: ProductionOrder, b: Balance): [boolean, string][] {
  return [
    [b.notReturned === 0, b.notReturned > 0 ? `Xưởng còn ${b.notReturned} cái chưa trả` : 'Xưởng đã trả đủ'],
    [b.pendingQC === 0, b.pendingQC > 0 ? `${b.pendingQC} cái chưa QC` : 'Đã QC hết'],
    [b.inRepair === 0, b.inRepair > 0 ? `${b.inRepair} cái đang sửa chưa xong` : 'Không còn hàng đang sửa'],
    [order.loss === 0 || order.lossApproved,
      order.loss > 0
        ? order.lossApproved ? `Hao hụt ${order.loss} cái đã duyệt` : `Hao hụt ${order.loss} cái chưa được duyệt`
        : 'Không có hao hụt'],
  ]
}

export const isOrderLate = (o: ProductionOrder, now: Date) => !o.cancelled && o.step !== 'done' && o.dueAt < now

// Lệnh đang chạy: chưa hoàn thành, chưa bị hủy
export const isLive = (o: ProductionOrder) => !o.cancelled && o.step !== 'done'

// Quá hạn = chưa trả lại mà đã qua hạn
export const isRepairLate = (r: RepairTicket, now: Date) =>
  (r.status === 'sent' || r.status === 'received') && r.dueAt < now

export const SIZES = ["XS", "S", "M", "L", "XL", "XXL"]

// Theo từng size: đặt bao nhiêu, đã nhận bao nhiêu, xưởng còn thiếu bao nhiêu
export function sizeProgress(order: ProductionOrder) {
  return (order.sizes ?? []).map(z => {
    const received = order.batches.reduce((t, b) => t + (b.sizes?.find(x => x.size === z.size)?.qty ?? 0), 0);
    return { size: z.size, ordered: z.qty, received, missing: Math.max(0, z.qty - received) };
  });
}
export const DEFECT_KIND: Record<"sua" | "vai" | "hong", string> = {
  sua: "Trả xưởng sửa", vai: "Loại · lỗi vải (không tính xưởng)", hong: "Loại · hàng B (hỏng)",
}

// Kiểm tra các dòng lỗi QC tự nhập
export function validateDefectLines(lines: { kind: string; size: string; defect: string; qty: number }[], sizes?: string[]) {
  for (const [i, l] of lines.entries()) {
    const row = `Dòng lỗi ${i + 1}: `
    if (!Number.isInteger(l.qty) || l.qty <= 0) return row + "số lượng phải là số nguyên lớn hơn 0"
    if (!l.defect.trim()) return row + "nhập mô tả lỗi"
    if (!l.size.trim()) return row + "chọn size"
    if (sizes?.length && !sizes.includes(l.size)) return row + `size ${l.size} không có trong lệnh`
  }
  return null
}

export function validateQC(received: number, q: { pass: number; sua: number; vai: number; hong: number }) {
  const vals = [q.pass, q.sua, q.vai, q.hong]
  if (vals.some(v => !Number.isInteger(v) || v < 0)) return 'Số lượng phải là số nguyên không âm'
  if (q.pass + q.sua + q.vai + q.hong !== received) return `Pass + fail phải bằng ${received}`
  return null
}

export function validateRequc(qty: number, q: { pass: number; again: number; hong: number }) {
  const vals = [q.pass, q.again, q.hong]
  if (vals.some(v => !Number.isInteger(v) || v < 0)) return 'Số lượng phải là số nguyên không âm'
  if (q.pass + q.again + q.hong !== qty) return `Pass + sửa tiếp + hỏng phải bằng ${qty}`
  return null
}

// Gợi ý lỗi: danh sách chuẩn + các lỗi QC đã từng tự ghi (lỗi hay gặp lên trước)
export function knownDefects(orders: ProductionOrder[], repairs: RepairTicket[], base: string[]) {
  const count = new Map<string, number>();
  const add = (d?: string) => { const k = d?.trim(); if (k) count.set(k, (count.get(k) ?? 0) + 1); };
  orders.forEach(o => o.batches.forEach(b => b.qc?.lines?.forEach(l => add(l.defect))));
  repairs.forEach(r => r.items?.forEach(i => add(i.defect)));
  const learned = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([d]) => d);
  return [...new Set([...learned, ...base])];
}
