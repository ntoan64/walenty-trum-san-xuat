import { DAY } from "./util";

const TZ = "Asia/Ho_Chi_Minh";

export const nf = (n: number, dg = 0) => Number(n).toLocaleString("vi-VN", { maximumFractionDigits: dg });
export const vnd = (n: number) => nf(Math.round(n)) + "đ";
export const pct = (x: number, dg = 1) => (x * 100).toFixed(dg).replace(".", ",") + "%";
// Tự ghép dd/MM để không phụ thuộc dấu phân cách của trình duyệt
const parts = (d: Date) => {
  const o: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d)) o[x.type] = x.value;
  return o;
};
export const fmtD = (d: Date) => { const p = parts(d); return `${p.day}/${p.month}`; };
export const fmtFull = (d: Date) => { const p = parts(d); return `${p.day}/${p.month}/${p.year}`; };
export const fmtDT = (d: Date) => { const p = parts(d); return `${p.hour}:${p.minute} ${p.day}/${p.month}`; };
export const fmtWeekday = (d: Date) =>
  d.toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "numeric", year: "numeric", timeZone: TZ });

// 0h hôm nay theo giờ Việt Nam (UTC+7, không có giờ mùa hè)
export function startOfTodayVN(now = new Date()) {
  const vn = new Date(now.getTime() + 7 * 3600e3);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - 7 * 3600e3);
}

export const daysLate = (due: Date, now = new Date()) => Math.max(1, Math.ceil((now.getTime() - due.getTime()) / DAY));

// yyyy-mm-dd theo giờ Việt Nam, dùng cho ô chọn ngày
export const isoDateVN = (d: Date) => { const p = parts(d); return `${p.year}-${p.month}-${p.day}`; };

// Năm / tháng theo giờ Việt Nam (tháng 1–12)
export const ymVN = (d: Date) => { const p = parts(d); return { y: Number(p.year), m: Number(p.month) }; };
