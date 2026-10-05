// Nhắc việc theo vai trò (gửi 8h sáng hoặc khi bấm "Nhắc việc ngay")
import type { Role } from "./types";
import type { DataState } from "./state";
import { calcBalance, canClose, isLive, isRepairLate } from "./orders";
import { byId, DAY } from "./util";
import { fmtD, fmtDT, nf } from "./format";

const hoursSince = (d: Date, now: Date) => Math.max(0, Math.round((now.getTime() - d.getTime()) / 3600e3));
const ws = (s: DataState, id?: string) => (id ? byId(s.workshops, id)?.name ?? "" : "");
const prod = (s: DataState, id: string) => byId(s.products, id)?.name ?? "";
const list = (items: string[], max = 6) => items.slice(0, max).map(x => `• ${x}`).join("\n") + (items.length > max ? `\n… và ${items.length - max} việc nữa` : "");

export function buildReminders(s: DataState, now: Date): { roles: Role[]; text: string }[] {
  const live = s.orders.filter(isLive);
  const out: { roles: Role[]; text: string }[] = [];

  /* ---- QC ---- */
  const qc: string[] = [];
  for (const o of live) for (const b of o.batches.filter(x => !x.qc)) {
    qc.push(`${o.code} · ${b.received} cái ${prod(s, o.product)} chờ QC (về lúc ${fmtDT(b.receivedAt)}, đã ${hoursSince(b.receivedAt, now)} giờ)`);
  }
  for (const r of s.repairs.filter(x => x.status === "returned")) qc.push(`Phiếu ${r.code}: ${ws(s, r.workshop)} đã trả ${r.qty} cái sửa, chờ QC lại`);
  const cr = s.customerRepairs ?? [];
  const crTodo = [
    ...cr.filter(r => r.status === "received").map(r => `Đồ khách ${r.code} (${r.customerName}) chưa gửi xưởng`),
    ...cr.filter(r => r.status === "returned").map(r => `Đồ khách ${r.code} đã sửa xong, gọi khách ${r.customerName} ${r.customerPhone} tới lấy`),
    ...cr.filter(r => r.status !== "done" && r.promisedAt < now).map(r => `⚠️ Đồ khách ${r.code} trễ hẹn trả (hẹn ${fmtD(r.promisedAt)})`),
  ];
  if (qc.length || crTodo.length) out.push({ roles: ["qc"], text: `🔔 Việc QC hôm nay\n${list([...qc, ...crTodo])}` });

  /* ---- Kho + Quản lý ---- */
  const kho: string[] = [];
  for (const o of live) {
    const left = (o.dueAt.getTime() - now.getTime()) / DAY;
    if (left < 0) kho.push(`⚠️ ${o.code} (${prod(s, o.product)}) trễ hạn ${Math.ceil(-left)} ngày · ${ws(s, o.workshop)}`);
    else if (left <= 1) kho.push(`${o.code} tới hạn ${fmtD(o.dueAt)} · ${ws(s, o.workshop)}`);
    if (o.batches.some(b => !b.qc)) kho.push(`${o.code} có hàng về chờ QC`);
  }
  for (const r of s.repairs.filter(x => isRepairLate(x, now))) kho.push(`⚠️ Phiếu sửa ${r.code}: ${ws(s, r.workshop)} giữ ${r.qty} cái quá hạn ${fmtD(r.dueAt)}`);
  for (const m of s.materials.filter(m => m.status === "active" && m.stock < m.minStock)) kho.push(`${m.code} ${m.name} sắp hết: còn ${nf(m.stock, 1)} ${m.unit}`);
  kho.push(...cr.filter(r => r.status !== "done" && r.promisedAt < now).map(r => `⚠️ Đồ khách ${r.code} trễ hẹn trả`));
  if (kho.length) out.push({ roles: ["kho"], text: `🔔 Việc kho hôm nay\n${list(kho, 8)}` });

  const mgr = [...kho];
  for (const o of live.filter(o => o.loss && !o.lossApproved)) mgr.push(`${o.code}: hao hụt ${o.loss} cái chờ duyệt`);
  for (const o of live) {
    const b = calcBalance(o, s.repairs.filter(r => r.order === o.id));
    if (o.step === "qc" && canClose(o, b)) mgr.push(`${o.code} đã đủ điều kiện, có thể đóng lệnh`);
  }
  if (mgr.length) out.push({ roles: ["quanly"], text: `🔔 Việc cần xử lý hôm nay\n${list(mgr, 10)}` });
  return out;
}
