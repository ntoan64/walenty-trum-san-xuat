import { calcBalance, isRepairLate, sum, type ProductionOrder } from "@core";
import type { DataState } from "@core/state";
import { repairsOf } from "./actions";

export const balanceOf = (s: DataState, o: ProductionOrder) => calcBalance(o, repairsOf(s, o));

export function finishedStock(s: DataState) {
  const m: Record<string, number> = {};
  for (const p of s.products) m[p.id] = 0;
  for (const t of s.finishedTxns) m[t.product] = (m[t.product] ?? 0) + t.qty;
  return m;
}

export const lateRepairs = (s: DataState, now: Date) => s.repairs.filter(r => isRepairLate(r, now));
export const openRepairs = (s: DataState) => s.repairs.filter(r => r.status !== "closed");
export const lowMaterials = (s: DataState) => s.materials.filter(m => m.stock < m.minStock);
export const pendingBatches = (s: DataState) =>
  s.orders.flatMap(o => o.batches.filter(b => !b.qc).map(b => ({ o, b })));

export function navBadges(s: DataState, now: Date): Partial<Record<string, number>> {
  return {
    qc: pendingBatches(s).length + s.repairs.filter(r => r.status === "returned").length + lateRepairs(s, now).length,
    materials: lowMaterials(s).length,
    // đồ khách: chờ gửi xưởng + chờ trả khách + trễ hẹn
    customer: (s.customerRepairs ?? []).filter(r => r.status === "received" || r.status === "returned" || (r.status !== "done" && r.promisedAt < now)).length,
    orders: s.orders.filter(o => o.step !== "done" && o.loss > 0 && !o.lossApproved).length,
  };
}

export const totalFinished = (s: DataState) => sum(Object.values(finishedStock(s)), v => v);

// Nguyên phụ liệu đã xuất kho cho lệnh (cần chuẩn bị giao xưởng cắt), gộp theo phụ liệu
export function issuedFor(s: DataState, o: ProductionOrder) {
  const m = new Map<string, number>();
  for (const t of s.materialTxns) if (t.type === "out" && t.order === o.code) m.set(t.material, (m.get(t.material) ?? 0) + t.qty);
  return [...m.entries()].map(([id, qty]) => ({ material: s.materials.find(x => x.id === id), qty })).filter(x => x.material);
}

// Vải đã giao cho lệnh (phụ liệu loại "vải"): tổng mét và mét / 1 sản phẩm, để quy hao hụt ra vải
export function fabricFor(s: DataState, o: ProductionOrder) {
  const fab = issuedFor(s, o).filter(x => x.material!.category === "vai");
  const meters = fab.reduce((t, x) => t + x.qty, 0);
  return { meters, perUnit: o.qty ? meters / o.qty : 0, unit: fab[0]?.material!.unit ?? "mét", names: fab.map(x => x.material!.name) };
}
