"use client";

import { Fragment, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { Product, ProductVariant } from "@core";
import { Button } from "@/components/ui/button";
import { matches } from "@/lib/search";
import { nf, vnd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StatusPill } from "./basics";
import { sapoImg, Thumb } from "./sapo-product";

type Cell = string | number | null;
type Order = { head: Record<string, Cell>; items: Record<string, Cell>[] };

const STATUS_TONE: Record<string, "ok" | "warn" | "bad" | "muted" | "brand"> = {
  "Chưa nhập": "warn", "Nhập một phần": "brand", "Hoàn thành": "ok", "Kết thúc": "muted", "Đã hủy": "bad",
};
const PAGE = 30;

// Gom các dòng file "chi tiết đơn đặt hàng nhập": dòng có Mã đơn là đầu đơn, các dòng sau là sản phẩm của đơn
export function groupOrders(columns: string[], rows: Cell[][]): Order[] {
  const out: Order[] = [];
  const codeCol = columns.findIndex(c => /^mã đơn đặt hàng$/i.test(c));
  for (const r of rows) {
    const obj = Object.fromEntries(columns.map((c, i) => [c, r[i] ?? null]));
    if (codeCol >= 0 && r[codeCol] != null) out.push({ head: obj, items: [] });
    else if (out.length && obj["Mã SKU"] != null) out[out.length - 1].items.push(obj);
  }
  return out;
}

const n = (x: Cell) => (typeof x === "number" ? x : Number(String(x ?? "").replace(/[^\d.-]/g, "")) || 0);
const t = (x: Cell) => (x == null ? "" : String(x));

export function PurchaseOrders({ columns, rows, q, products }: { columns: string[]; rows: Cell[][]; q: string; products: Product[] }) {
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const bySku = new Map<string, { p: Product; v: ProductVariant }>();
  for (const p of products) for (const v of p.variants ?? []) bySku.set(v.sku, { p, v });

  const orders = groupOrders(columns, rows);
  const statuses = [...new Set(orders.map(o => t(o.head["Trạng thái đơn"])).filter(Boolean))];
  const shown = orders
    .filter(o => !status || t(o.head["Trạng thái đơn"]) === status)
    .filter(o => matches(q, ...Object.values(o.head), ...o.items.flatMap(i => [i["Tên sản phẩm"], i["Mã SKU"]])));
  const pending = orders.filter(o => /chưa nhập|một phần/i.test(t(o.head["Trạng thái đơn"])));

  return (
    <>
      <div className="flex flex-wrap items-center gap-1 px-4 pt-3 md:px-5" role="group" aria-label="Lọc trạng thái đơn">
        {[["", "Tất cả", orders.length] as const, ...statuses.map(st => [st, st, orders.filter(o => t(o.head["Trạng thái đơn"]) === st).length] as const)].map(([k, label, c]) => (
          <button key={k} type="button" aria-pressed={status === k} onClick={() => { setStatus(k); setLimit(PAGE); }}
            className={cn("rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap", status === k ? "bg-brand text-brand-fg" : "bg-surface-2 text-muted-foreground hover:bg-surface-3")}>
            {label} <span className="num opacity-70">{c}</span>
          </button>
        ))}
        {pending.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            Đang chờ hàng về: <b className="num text-fg">{pending.length}</b> đơn · còn <b className="num text-fg">{nf(pending.reduce((s, o) => s + n(o.head["Tổng số lượng đặt"]) - n(o.head["Tổng số lượng nhập"]), 0))}</b> cái
          </span>
        )}
      </div>
      <div className="mt-2 overflow-x-auto border-t border-line">
        <table className="wl-table">
          <thead>
            <tr>
              <th className="w-8" /><th>Mã đơn</th><th>Ngày tạo</th><th>Xưởng / nhà cung cấp</th><th>Trạng thái</th>
              <th className="r">Đặt</th><th className="r">Đã nhập</th><th className="r">Giá trị đơn</th><th>Nhân viên</th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, limit).map(o => {
              const code = t(o.head["Mã đơn đặt hàng"]), isOpen = open === code;
              const st = t(o.head["Trạng thái đơn"]);
              const ord = n(o.head["Tổng số lượng đặt"]), got = n(o.head["Tổng số lượng nhập"]);
              return (
                <Fragment key={code}>
                  <tr className={cn("cursor-pointer", isOpen && "bg-brand-soft/30", st === "Đã hủy" && "opacity-60")} onClick={() => setOpen(isOpen ? null : code)}>
                    <td>
                      <button type="button" aria-expanded={isOpen} aria-label={`${isOpen ? "Thu gọn" : "Xem"} đơn ${code}`}
                        onClick={e => { e.stopPropagation(); setOpen(isOpen ? null : code); }} className="grid size-6 place-items-center rounded text-subtle hover:bg-surface-3">
                        <ChevronRight className={cn("size-4 transition-transform duration-200", isOpen && "rotate-90")} />
                      </button>
                    </td>
                    <td className="num font-bold whitespace-nowrap text-brand">{code}</td>
                    <td className="num text-[12.5px] whitespace-nowrap">{t(o.head["Ngày tạo đơn"])}</td>
                    <td className="font-medium">{t(o.head["Tên nhà cung cấp"])}</td>
                    <td>{st && <StatusPill tone={STATUS_TONE[st] ?? "muted"}>{st}</StatusPill>}</td>
                    <td className="r num">{nf(ord)}</td>
                    <td className={cn("r num", got >= ord && ord > 0 ? "text-ok" : got > 0 ? "text-brand" : "text-subtle")}>{nf(got)}</td>
                    <td className="r num">{vnd(n(o.head["Giá trị đơn"]))}</td>
                    <td className="text-[12.5px] text-muted-foreground">{t(o.head["Nhân viên phụ trách"]) || t(o.head["Nhân viên tạo"])}</td>
                  </tr>
                  {isOpen && (
                    <tr className="hover:!bg-transparent">
                      <td />
                      <td colSpan={8} className="!pt-0">
                        <div className="reveal overflow-x-auto rounded-xl border border-line bg-surface shadow-[0_4px_16px_rgba(31,27,26,0.05)]">
                          <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-line px-4 py-2.5 text-xs text-muted-foreground">
                            {(["Ngày nhập dự kiến", "Ngày hoàn thành", "Ngày kết thúc", "Ngày huỷ đơn", "Chi nhánh tạo đơn", "Mã nhà cung cấp", "SĐT nhà cung cấp", "Ghi chú", "Tags"] as const)
                              .filter(k => o.head[k] != null).map(k => <span key={k}>{k}: <b className="text-fg">{t(o.head[k])}</b></span>)}
                          </div>
                          <table className="w-full text-[12.5px]">
                            <thead className="bg-surface-low text-left text-[10.5px] tracking-[0.05em] text-muted-foreground uppercase">
                              <tr>
                                <th className="px-3 py-2">Ảnh</th><th className="px-3 py-2">Sản phẩm</th><th className="px-3 py-2">SKU</th>
                                <th className="px-3 py-2 text-right">SL đặt</th><th className="px-3 py-2 text-right">SL nhập</th>
                                <th className="px-3 py-2 text-right">Đơn giá</th><th className="px-3 py-2 text-right">Thành tiền</th>
                              </tr>
                            </thead>
                            <tbody>
                              {o.items.map((i, k) => {
                                const m = bySku.get(t(i["Mã SKU"]));
                                const img = m?.v.image ?? m?.p.variants?.find(v => v.image)?.image;
                                return (
                                  <tr key={k} className="border-t border-line">
                                    <td className="px-3 py-1.5"><Thumb src={sapoImg(img, "small")} full={img} alt={t(i["Tên sản phẩm"])} size={32} /></td>
                                    <td className="px-3 py-1.5">{t(i["Tên sản phẩm"])}{i["Chi chú sản phẩm"] != null && <div className="text-[11px] text-subtle">{t(i["Chi chú sản phẩm"])}</div>}</td>
                                    <td className="num px-3 py-1.5">{t(i["Mã SKU"])}</td>
                                    <td className="num px-3 py-1.5 text-right">{nf(n(i["Số lượng đặt"]))}</td>
                                    <td className="num px-3 py-1.5 text-right">{nf(n(i["Số lượng nhập"]))}</td>
                                    <td className="num px-3 py-1.5 text-right">{vnd(n(i["Đơn giá"]))}</td>
                                    <td className="num px-3 py-1.5 text-right">{vnd(n(i["Thành tiền"]))}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!shown.length && <tr><td colSpan={9} className="py-6 text-center text-[13px] text-muted-foreground">Không có đơn phù hợp.</td></tr>}
          </tbody>
        </table>
      </div>
      {shown.length > limit && (
        <div className="flex justify-center border-t border-line p-3">
          <Button variant="secondary" size="sm" onClick={() => setLimit(limit + PAGE)}>Xem thêm {Math.min(PAGE, shown.length - limit)} đơn</Button>
        </div>
      )}
    </>
  );
}
