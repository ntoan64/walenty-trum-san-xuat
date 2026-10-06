"use client";

import { useState } from "react";
import { ChartColumn, Factory, Layers, PackageCheck, Table2 } from "lucide-react";
import { costOf, MATERIAL_CATEGORIES, sum, type MaterialCategory } from "@core";
import { Button } from "@/components/ui/button";
import { useSapoSheet } from "@/components/xf/sapo-sheet";
import { groupOrders } from "@/components/xf/sapo-purchase";
import { ProductThumb } from "@/components/xf/sapo-product";
import { useStore } from "@/lib/store";
import { useDraft } from "@/lib/use-draft";
import { nf, vnd, ymVN } from "@/lib/format";
import { finishedStock } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import { ExportButton } from "@/components/xf/export-button";
import { EmptyState, PageHeader, Panel, StatCard, TableWrap } from "@/components/xf/basics";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const short = (n: number) =>
  n >= 1e9 ? `${nf(n / 1e9, 1)} tỷ` : n >= 1e6 ? `${nf(n / 1e6, 1)} tr` : n >= 1e3 ? `${nf(n / 1e3, 0)}k` : nf(n);

/* ---------- Biểu đồ cột tiền nhập theo tháng (1 chuỗi, không cần chú thích) ---------- */
function MonthBars({ values, counts, selected, onPick, unit = "lần nhập" }: {
  values: number[]; counts: number[]; selected: number; onPick: (m: number) => void; unit?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...values, 0);
  const top = max > 0 ? max : 1;
  const peak = values.indexOf(max);
  return (
    <figure className="relative">
      <div className="relative flex h-56 items-end gap-[2px] border-b border-line-strong px-1 sm:gap-1.5" role="img"
        aria-label={`Tiền nhập theo tháng: ${values.map((v, i) => `tháng ${i + 1} ${vnd(v)}`).join(", ")}`}>
        {/* đường lưới mờ ở mức cao nhất */}
        {max > 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-line">
            <span className="num absolute -top-4 right-0 text-[10.5px] text-subtle">{short(max)}</span>
          </div>
        )}
        {values.map((v, i) => {
          const m = i + 1;
          const active = selected === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onPick(active ? 0 : m)}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`Tháng ${m}: ${vnd(v)}, ${counts[i]} ${unit}`}
              aria-pressed={active}
              className="group relative flex h-full flex-1 items-end justify-center"
            >
              <span
                className={cn(
                  "block w-full max-w-10 rounded-t-[4px] transition-[height,background-color] duration-500 ease-out",
                  v > 0 ? (active || hover === i ? "bg-brand" : selected ? "bg-brand/35" : "bg-brand/80") : "bg-transparent",
                )}
                style={{ height: v > 0 ? `max(${(v / top) * 100}%, 3px)` : 0 }}
              />
              {i === peak && max > 0 && hover === null && (
                <span className="num pointer-events-none absolute -top-0.5 -translate-y-full text-[10.5px] font-semibold text-fg"
                  style={{ bottom: `${(v / top) * 100}%`, top: "auto" }}>{short(v)}</span>
              )}
            </button>
          );
        })}
        {hover !== null && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md bg-fg px-2.5 py-1.5 text-[12px] text-bg shadow-lg"
            style={{ left: `${((hover + 0.5) / 12) * 100}%`, bottom: `calc(${(values[hover] / top) * 100}% + 8px)` }}
          >
            <div className="font-semibold">Tháng {hover + 1}</div>
            <div className="num">{vnd(values[hover])}</div>
            <div className="text-[11px] opacity-75">{counts[hover]} {unit}</div>
          </div>
        )}
      </div>
      <div className="flex gap-[2px] px-1 pt-1.5 sm:gap-1.5">
        {MONTHS.map(m => (
          <span key={m} className={cn("num flex-1 text-center text-[10.5px]", selected === m ? "font-bold text-brand" : "text-subtle")}>T{m}</span>
        ))}
      </div>
      <figcaption className="mt-1 text-[11.5px] text-muted-foreground">Bấm vào một cột để xem chi tiết tháng đó ở các bảng bên dưới.</figcaption>
    </figure>
  );
}

export default function StatsPage() {
  const { data: s } = useStore();
  const now = new Date();
  const thisYear = ymVN(now).y;
  // Đơn đặt hàng nhập (Sapo): tính theo ngày tạo đơn, bỏ đơn đã hủy.
  // Giá trị đặt = "Giá trị đơn"; giá trị đã nhập = Σ SL nhập × đơn giá từng dòng.
  const purchase = useSapoSheet("purchase");
  const num = (x: unknown) => (typeof x === "number" ? x : Number(String(x ?? "").replace(/[^\d.-]/g, "")) || 0);
  const pos = (purchase ? groupOrders(purchase.columns, purchase.rows) : [])
    .map(o => {
      const d = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(String(o.head["Ngày tạo đơn"] ?? ""));
      return {
        code: String(o.head["Mã đơn đặt hàng"]), supplier: String(o.head["Tên nhà cung cấp"] ?? "Khác"), status: String(o.head["Trạng thái đơn"] ?? ""),
        y: d ? +d[3] : 0, m: d ? +d[2] : 0,
        value: num(o.head["Giá trị đơn"]), qty: num(o.head["Tổng số lượng đặt"]), got: num(o.head["Tổng số lượng nhập"]),
        gotValue: o.items.reduce((t, i) => t + num(i["Số lượng nhập"]) * num(i["Đơn giá"]), 0),
      };
    })
    .filter(o => o.y && o.status !== "Đã hủy");
  const years = [...new Set([thisYear, ...s.materialTxns.map(t => ymVN(t.at).y), ...s.finishedTxns.map(t => ymVN(t.at).y), ...pos.map(o => o.y)])].sort((a, b) => b - a);
  const [series, setSeries] = useDraft<"mat" | "po">("stats:series", "po");
  const [prodLimit, setProdLimit] = useState(30);
  const [year, setYear] = useDraft("stats:year", thisYear);
  const [month, setMonth] = useDraft("stats:month", 0); // 0 = cả năm
  const [cat, setCat] = useDraft<"all" | MaterialCategory>("stats:cat", "all");

  const ins = s.materialTxns.filter(t => t.type === "in").map(t => ({ ...t, ...ymVN(t.at), money: t.qty * (t.price ?? 0) }));
  const inYear = ins.filter(t => t.y === year);
  const byMonth = MONTHS.map(m => sum(inYear.filter(t => t.m === m), t => t.money));
  const countByMonth = MONTHS.map(m => inYear.filter(t => t.m === m).length);
  const inPeriod = inYear.filter(t => !month || t.m === month);
  const periodLabel = month ? `tháng ${month}/${year}` : `năm ${year}`;

  // phụ liệu: nhập trong kỳ + tồn hiện tại
  const matRows = s.materials
    .filter(m => cat === "all" || m.category === cat)
    .map(m => {
      const t = inPeriod.filter(x => x.material === m.id);
      return { m, qty: sum(t, x => x.qty), money: sum(t, x => x.money), times: t.length };
    })
    .sort((a, b) => b.money - a.money);
  const catRows = (Object.keys(MATERIAL_CATEGORIES) as MaterialCategory[])
    .map(k => {
      const ids = new Set(s.materials.filter(m => m.category === k).map(m => m.id));
      const t = inPeriod.filter(x => ids.has(x.material));
      return { k, money: sum(t, x => x.money), times: t.length, stockValue: sum(s.materials.filter(m => m.category === k), m => m.stock * m.avgPrice) };
    })
    .filter(r => r.money > 0 || r.stockValue > 0);

  // đặt hàng xưởng (Sapo)
  const poYear = pos.filter(o => o.y === year);
  const poByMonth = MONTHS.map(m => sum(poYear.filter(o => o.m === m), o => o.value));
  const poGotByMonth = MONTHS.map(m => sum(poYear.filter(o => o.m === m), o => o.gotValue));
  const poCountByMonth = MONTHS.map(m => poYear.filter(o => o.m === m).length);
  const poPeriod = poYear.filter(o => !month || o.m === month);
  const supRows = [...new Set(poPeriod.map(o => o.supplier))].map(sup => {
    const os = poPeriod.filter(o => o.supplier === sup);
    return { sup, n: os.length, qty: sum(os, o => o.qty), got: sum(os, o => o.got), value: sum(os, o => o.value), gotValue: sum(os, o => o.gotValue) };
  }).sort((a, b) => b.value - a.value);

  // thành phẩm: mẫu Sapo lấy tồn + giá trị theo Sapo; mẫu tự tạo lấy kho thành phẩm web
  const stock = finishedStock(s);
  const fg = s.finishedTxns.map(t => ({ ...t, ...ymVN(t.at) })).filter(t => t.y === year && (!month || t.m === month));
  const prodRows = s.products.map(p => {
    const c = costOf(p, s.materials), web = stock[p.id] ?? 0;
    return { p, inQty: sum(fg.filter(t => t.product === p.id), t => t.qty), stock: web, cost: c, value: web * c };
  }).sort((a, b) => b.value - a.value);

  const yearTotal = sum(byMonth, v => v);
  const periodTotal = sum(inPeriod, t => t.money);
  const matStockValue = sum(s.materials, m => m.stock * m.avgPrice);
  const fgValue = sum(prodRows, r => r.value);
  const poYearTotal = sum(poByMonth, v => v);
  const poPeriodTotal = sum(poPeriod, o => o.value);

  return (
    <>
      <PageHeader
        eyebrow={<>Quản trị <span className="text-subtle">/</span> <span className="text-subtle">Thống kê</span></>}
        title="Thống kê nhập kho"
        desc="Tiền đặt hàng xưởng (theo file đơn đặt hàng nhập Sapo), tiền nhập phụ liệu theo tháng / năm; tồn phụ liệu và thành phẩm (theo Sapo)."
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="st-year" className="text-xs text-muted-foreground">Năm</label>
            <select id="st-year" className="field-input !w-28 !bg-surface" value={year} onChange={e => { setYear(+e.target.value); setMonth(0); }}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <label htmlFor="st-month" className="text-xs text-muted-foreground">Tháng</label>
            <select id="st-month" className="field-input !w-32 !bg-surface" value={month} onChange={e => setMonth(+e.target.value)}>
              <option value={0}>Cả năm</option>
              {MONTHS.map(m => <option key={m} value={m}>Tháng {m}</option>)}
            </select>
            <ExportButton name={`thong-ke-${year}${month ? `-thang-${month}` : ""}`} build={() => [
              { name: `Theo tháng ${year}`,
                columns: [{ header: "Tháng", key: "m" }, { header: "Đơn đặt xưởng", key: "pn", fmt: "int" }, { header: "Giá trị đặt xưởng", key: "pv", fmt: "money", width: 20 }, { header: "Giá trị đã nhập", key: "pg", fmt: "money", width: 20 }, { header: "Lần nhập phụ liệu", key: "n", fmt: "int" }, { header: "Tiền nhập phụ liệu", key: "money", fmt: "money", width: 22 }],
                rows: MONTHS.map(m => ({ m: `Tháng ${m}`, pn: poCountByMonth[m - 1], pv: poByMonth[m - 1], pg: poGotByMonth[m - 1], n: countByMonth[m - 1], money: byMonth[m - 1] })) },
              { name: "Đặt hàng xưởng", note: `Kỳ: ${periodLabel}`,
                columns: [{ header: "Xưởng / nhà cung cấp", key: "sup", width: 32 }, { header: "Số đơn", key: "n", fmt: "int" }, { header: "SL đặt", key: "qty", fmt: "int" }, { header: "SL đã nhập", key: "got", fmt: "int" }, { header: "Giá trị đặt", key: "value", fmt: "money" }, { header: "Giá trị đã nhập", key: "gotValue", fmt: "money" }],
                rows: supRows },
              { name: "Phụ liệu", note: `Kỳ: ${periodLabel}`,
                columns: [{ header: "Mã", key: "code" }, { header: "Phụ liệu", key: "name", width: 26 }, { header: "Loại", key: "cat" }, { header: "Lần nhập", key: "times", fmt: "int" }, { header: "SL nhập", key: "qty", fmt: "dec" }, { header: "ĐVT", key: "unit" }, { header: "Tiền nhập", key: "money", fmt: "money" }, { header: "Tồn hiện tại", key: "stock", fmt: "dec" }, { header: "Giá trị tồn", key: "value", fmt: "money" }],
                rows: matRows.map(r => ({ code: r.m.code, name: r.m.name, cat: MATERIAL_CATEGORIES[r.m.category], times: r.times, qty: r.qty, unit: r.m.unit, money: r.money, stock: r.m.stock, value: r.m.stock * r.m.avgPrice })) },
              { name: "Sản phẩm", note: `Kỳ: ${periodLabel}`,
                columns: [{ header: "Mã mẫu", key: "sku" }, { header: "Sản phẩm", key: "name", width: 28 }, { header: "Loại", key: "cat" }, { header: "Nhập kho SX trong kỳ", key: "inQty", fmt: "int" }, { header: "Tồn", key: "stock", fmt: "int" }, { header: "Giá vốn / cái", key: "cost", fmt: "money" }, { header: "Giá trị tồn", key: "value", fmt: "money" }],
                rows: prodRows.map(r => ({ sku: r.p.sku, name: r.p.name, cat: r.p.category, inQty: r.inQty, stock: r.stock, cost: r.cost, value: r.value })) },
            ]} />
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`Đặt hàng xưởng ${month ? `tháng ${month}` : `năm ${year}`}`} value={<span className="text-[20px]">{vnd(month ? poPeriodTotal : poYearTotal)}</span>}
          sub={`${poPeriod.length} đơn · đã nhập ${vnd(sum(poPeriod, o => o.gotValue))}`} tone="brand" />
        <StatCard label={`Tiền nhập phụ liệu ${month ? `tháng ${month}` : `năm ${year}`}`} value={<span className="text-[20px]">{vnd(month ? periodTotal : yearTotal)}</span>} sub={`${inPeriod.length} lần nhập`} />
        <StatCard label="Giá trị tồn phụ liệu" value={<span className="text-[20px]">{vnd(matStockValue)}</span>} sub={`${s.materials.length} mã phụ liệu`} tone="brown" />
        <StatCard label="Thành phẩm đang có" value={nf(sum(prodRows, r => r.stock))} unit="cái" sub={`giá trị ${vnd(fgValue)}`} tone="ok" />
      </div>

      <Panel
        title={`${series === "po" ? "Tiền đặt hàng xưởng" : "Tiền nhập phụ liệu"} theo tháng · ${year}`} icon={ChartColumn}
        actions={
          <div role="group" aria-label="Chọn số liệu" className="flex gap-1">
            {([["po", "Đặt hàng xưởng"], ["mat", "Nhập phụ liệu"]] as const).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={series === k} onClick={() => setSeries(k)}
                className={cn("rounded-md px-2.5 py-1 text-xs font-semibold", series === k ? "bg-brand text-brand-fg" : "bg-surface-2 text-muted-foreground hover:bg-surface-3")}>{label}</button>
            ))}
          </div>
        }
      >
        {series === "po"
          ? (poYearTotal > 0 ? <MonthBars values={poByMonth} counts={poCountByMonth} selected={month} onPick={setMonth} unit="đơn đặt" />
            : <EmptyState>{purchase ? `Năm ${year} chưa có đơn đặt hàng nhập.` : "Chưa nhập file đơn đặt hàng nhập Sapo (trang Lệnh sản xuất)."}</EmptyState>)
          : (yearTotal > 0 ? <MonthBars values={byMonth} counts={countByMonth} selected={month} onPick={setMonth} />
            : <EmptyState>Năm {year} chưa có lần nhập phụ liệu nào.</EmptyState>)}
      </Panel>

      {supRows.length > 0 && (
        <Panel title={`Đặt hàng xưởng theo nhà cung cấp · ${periodLabel}`} icon={Factory} flush>
          <TableWrap>
            <table className="wl-table">
              <thead><tr><th>Xưởng / nhà cung cấp</th><th className="r">Số đơn</th><th className="r">SL đặt</th><th className="r">SL đã nhập</th><th className="r">Giá trị đặt</th><th className="r">Giá trị đã nhập</th><th className="r">Còn chờ</th></tr></thead>
              <tbody>
                {supRows.map(r => (
                  <tr key={r.sup}>
                    <td className="font-medium">{r.sup}</td>
                    <td className="r num">{r.n}</td>
                    <td className="r num">{nf(r.qty)}</td>
                    <td className="r num">{nf(r.got)}</td>
                    <td className="r num font-semibold">{vnd(r.value)}</td>
                    <td className="r num text-ok">{vnd(r.gotValue)}</td>
                    <td className="r num">{r.qty - r.got > 0 ? `${nf(r.qty - r.got)} cái` : "–"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr>
                <td>Tổng</td><td className="r num">{sum(supRows, r => r.n)}</td><td className="r num">{nf(sum(supRows, r => r.qty))}</td><td className="r num">{nf(sum(supRows, r => r.got))}</td>
                <td className="r num">{vnd(sum(supRows, r => r.value))}</td><td className="r num">{vnd(sum(supRows, r => r.gotValue))}</td><td />
              </tr></tfoot>
            </table>
          </TableWrap>
          <p className="px-4 py-2.5 text-[11.5px] text-muted-foreground md:px-5">Theo ngày tạo đơn trong file Sapo, không tính đơn đã hủy. Giá trị đã nhập = số lượng đã nhập × đơn giá.</p>
        </Panel>
      )}

      <div className="grid grid-cols-1 items-start gap-5 min-[1100px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel
          title={`Nguyên phụ liệu · ${periodLabel}`} icon={Layers} flush
          actions={
            <select aria-label="Lọc loại phụ liệu" className="field-input !min-h-9 !w-40 !bg-surface !py-1.5" value={cat} onChange={e => setCat(e.target.value as typeof cat)}>
              <option value="all">Tất cả loại</option>
              {(Object.entries(MATERIAL_CATEGORIES) as [MaterialCategory, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          }
        >
          <TableWrap>
            <table className="wl-table">
              <thead><tr><th>Mã</th><th>Phụ liệu</th><th className="r">Lần nhập</th><th className="r">SL nhập</th><th className="r">Tiền nhập</th><th className="r">Tồn hiện tại</th><th className="r">Giá trị tồn</th></tr></thead>
              <tbody>
                {matRows.length ? matRows.map(({ m, qty, money, times }) => (
                  <tr key={m.id} className={money ? "" : "text-muted-foreground"}>
                    <td className="num font-bold text-brand">{m.code}</td>
                    <td>{m.name}</td>
                    <td className="r num">{times || "–"}</td>
                    <td className="r num">{qty ? `${nf(qty, 2)} ${m.unit}` : "–"}</td>
                    <td className="r num font-semibold">{money ? vnd(money) : "–"}</td>
                    <td className="r num">{nf(m.stock, 2)} {m.unit}</td>
                    <td className="r num">{vnd(m.stock * m.avgPrice)}</td>
                  </tr>
                )) : <tr><td colSpan={7}><EmptyState>Chưa có phụ liệu.</EmptyState></td></tr>}
              </tbody>
              {matRows.length > 0 && (
                <tfoot><tr>
                  <td colSpan={4}>Tổng</td>
                  <td className="r num">{vnd(sum(matRows, r => r.money))}</td>
                  <td />
                  <td className="r num">{vnd(sum(matRows, r => r.m.stock * r.m.avgPrice))}</td>
                </tr></tfoot>
              )}
            </table>
          </TableWrap>
        </Panel>

        <Panel title={`Theo loại · ${periodLabel}`} icon={Layers} flush>
          <TableWrap>
            <table className="wl-table !min-w-0">
              <thead><tr><th>Loại</th><th className="r">Tiền nhập</th><th className="r">Tồn</th></tr></thead>
              <tbody>
                {catRows.length ? catRows.map(r => (
                  <tr key={r.k}>
                    <td>{MATERIAL_CATEGORIES[r.k]}<div className="text-xs text-subtle">{r.times} lần nhập</div></td>
                    <td className="r num font-semibold">{vnd(r.money)}</td>
                    <td className="r num">{vnd(r.stockValue)}</td>
                  </tr>
                )) : <tr><td colSpan={3}><EmptyState>Chưa có số liệu.</EmptyState></td></tr>}
              </tbody>
            </table>
          </TableWrap>
        </Panel>
      </div>

      <Panel title={`Thành phẩm · tồn, nhập kho SX ${periodLabel}`} icon={PackageCheck} flush>
        <TableWrap>
          <table className="wl-table">
            <thead><tr><th className="w-12">Ảnh</th><th>Sản phẩm</th><th className="r">Nhập kho SX</th><th className="r">Tồn</th><th className="r">Giá vốn / cái</th><th className="r">Giá trị tồn</th></tr></thead>
            <tbody>
              {prodRows.length ? prodRows.slice(0, prodLimit).map(r => (
                <tr key={r.p.id}>
                  <td className="!py-1.5"><ProductThumb p={r.p} size={32} /></td>
                  <td><span className="font-serif">{r.p.name}</span>{r.p.category && <div className="text-[11.5px] text-subtle">{r.p.category}</div>}</td>
                  <td className="r num">{r.inQty ? `+${nf(r.inQty)}` : "–"}</td>
                  <td className="r num font-semibold">{nf(r.stock)}</td>
                  <td className="r num">{vnd(r.cost)}</td>
                  <td className="r num">{vnd(r.value)}</td>
                </tr>
              )) : <tr><td colSpan={6}><EmptyState>Chưa có sản phẩm.</EmptyState></td></tr>}
            </tbody>
            {prodRows.length > 0 && (
              <tfoot><tr>
                <td colSpan={2}>Tổng ({prodRows.length} mẫu)</td>
                <td className="r num">+{nf(sum(prodRows, r => r.inQty))}</td>
                <td className="r num">{nf(sum(prodRows, r => r.stock))}</td>
                <td />
                <td className="r num">{vnd(fgValue)}</td>
              </tr></tfoot>
            )}
          </table>
        </TableWrap>
        {prodRows.length > prodLimit && (
          <div className="flex justify-center border-t border-line p-3">
            <Button variant="secondary" size="sm" onClick={() => setProdLimit(prodLimit + 30)}>Xem thêm {Math.min(30, prodRows.length - prodLimit)} sản phẩm</Button>
          </div>
        )}
      </Panel>

      <Panel title={`Bảng số liệu theo tháng · ${year}`} icon={Table2} flush>
        <TableWrap>
          <table className="wl-table">
            <thead><tr><th>Tháng</th><th className="r">Đơn đặt xưởng</th><th className="r">Giá trị đặt</th><th className="r">Đã nhập</th><th className="r">Lần nhập PL</th><th className="r">Tiền nhập phụ liệu</th><th className="r">Thành phẩm SX</th></tr></thead>
            <tbody>
              {MONTHS.map(m => {
                const fgm = sum(s.finishedTxns.filter(t => { const d = ymVN(t.at); return d.y === year && d.m === m; }), t => t.qty);
                return (
                  <tr key={m} className={cn(month === m && "bg-brand-soft/40", !byMonth[m - 1] && !fgm && !poByMonth[m - 1] && "text-muted-foreground")}>
                    <td>Tháng {m}</td>
                    <td className="r num">{poCountByMonth[m - 1] || "–"}</td>
                    <td className="r num font-semibold">{poByMonth[m - 1] ? vnd(poByMonth[m - 1]) : "–"}</td>
                    <td className="r num text-ok">{poGotByMonth[m - 1] ? vnd(poGotByMonth[m - 1]) : "–"}</td>
                    <td className="r num">{countByMonth[m - 1] || "–"}</td>
                    <td className="r num font-semibold">{byMonth[m - 1] ? vnd(byMonth[m - 1]) : "–"}</td>
                    <td className="r num">{fgm ? `${nf(fgm)} cái` : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr>
              <td>Cả năm</td>
              <td className="r num">{poYear.length}</td>
              <td className="r num">{vnd(poYearTotal)}</td>
              <td className="r num">{vnd(sum(poGotByMonth, v => v))}</td>
              <td className="r num">{inYear.length}</td>
              <td className="r num">{vnd(yearTotal)}</td>
              <td className="r num">{nf(sum(s.finishedTxns.filter(t => ymVN(t.at).y === year), t => t.qty))} cái</td>
            </tr></tfoot>
          </table>
        </TableWrap>
      </Panel>
    </>
  );
}
