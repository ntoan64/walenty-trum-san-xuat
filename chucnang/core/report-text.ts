import { aggregate, inRange, isRepairLate, DAY } from "./index";
import type { DataState } from "./state";
import { fmtD, startOfTodayVN } from "./format";

export type Period = "day" | "week";

export const periodStart = (p: Period, now = new Date()) =>
  p === "day" ? startOfTodayVN(now) : new Date(now.getTime() - 7 * DAY);

// Nội dung tin Telegram cho báo cáo (cron 8h sáng dùng lại hàm này)
export function reportText(s: DataState, p: Period, now = new Date()) {
  const a = aggregate(inRange(s.events, periodStart(p, now)));
  const open = s.repairs.filter(r => r.status !== "closed");
  const late = open.filter(r => isRepairLate(r, now));
  const low = s.materials.filter(m => m.stock < m.minStock);
  return [
    `📊 Báo cáo ${p === "day" ? "hôm nay " + fmtD(now) : "7 ngày qua"}`,
    `Gửi may: ${a.issue} · Nhận về: ${a.receive}`,
    `QC pass: ${a.pass} · Fail: ${a.fail}`,
    `Trả về xưởng sửa: ${a.sua} · Xưởng trả lại: ${a.back}`,
    `Hao hụt: ${a.loss}`,
    `Phiếu sửa đang mở: ${open.length}${late.length ? ` (${late.length} quá hạn: ${late.map(r => r.code).join(", ")})` : ""}`,
    low.length ? `Phụ liệu sắp hết: ${low.map(m => m.code).join(", ")}` : "Phụ liệu: đủ",
  ].join("\n");
}
