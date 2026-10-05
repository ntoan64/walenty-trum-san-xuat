"use client";

import { useState } from "react";
import { ChartColumn, Layers, PackageCheck, Table2 } from "lucide-react";
import { MATERIAL_CATEGORIES, sum, unitCost, type MaterialCategory } from "@core";
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
function MonthBars({ values, counts, selected, onPick }: {
  values: number[]; counts: number[]; selected: number; onPick: (m: number) => void;
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
              aria-label={`Tháng ${m}: ${vnd(v)}, ${counts[i]} lần nhập`}
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
            <div className="text-[11px] opacity-75">{counts[hover]} lần nhập</div>
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
  const years = [...new Set([thisYear, ...s.materialTxns.map(t => ymVN(t.at).y), ...s.finishedTxns.map(t => ymVN(t.at).y)])].sort((a, b) => b - a);
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

  // thành phẩm: nhập kho trong kỳ + tồn hiện tại
  const stock = finishedStock(s);
  const fg = s.finishedTxns.map(t => ({ ...t, ...ymVN(t.at) })).filter(t => t.y === year && (!month || t.m === month));
  const prodRows = s.products.map(p => {
    const c = unitCost(p, s.materials);
    return { p, inQty: sum(fg.filter(t => t.product === p.id), t => t.qty), stock: stock[p.id] ?? 0, cost: c };
  });

  const yearTotal = sum(byMonth, v => v);
  const periodTotal = sum(inPeriod, t => t.money);
  const matStockValue = sum(s.materials, m => m.stock * m.avgPrice);
  const fgValue = sum(prodRows, r => r.stock * r.cost);

  return (
    <>
      <PageHeader
        eyebrow={<>Quản trị <span className="text-subtle">/</span> <span className="text-subtle">Thống kê</span></>}
        title="Thống kê nhập kho"
        desc="Tiền nhập nguyên phụ liệu theo tháng, theo năm; tồn phụ liệu và thành phẩm hiện có."
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
                columns: [{ header: "Tháng", key: "m" }, { header: "Lần nhập", key: "n", fmt: "int" }, { header: "Tiền nhập phụ liệu", key: "money", fmt: "money", width: 22 }],
                rows: MONTHS.map(m => ({ m: `Tháng ${m}`, n: countByMonth[m - 1], money: byMonth[m - 1] })) },
              { name: "Phụ liệu", note: `Kỳ: ${periodLabel}`,
                columns: [{ header: "Mã", key: "code" }, { header: "Phụ liệu", key: "name", width: 26 }, { header: "Loại", key: "cat" }, { header: "Lần nhập", key: "times", fmt: "int" }, { header: "SL nhập", key: "qty", fmt: "dec" }, { header: "ĐVT", key: "unit" }, { header: "Tiền nhập", key: "money", fmt: "money" }, { header: "Tồn hiện tại", key: "stock", fmt: "dec" }, { header: "Giá trị tồn", key: "value", fmt: "money" }],
                rows: matRows.map(r => ({ code: r.m.code, name: r.m.name, cat: MATERIAL_CATEGORIES[r.m.category], times: r.times, qty: r.qty, unit: r.m.unit, money: r.money, stock: r.m.stock, value: r.m.stock * r.m.avgPrice })) },
              { name: "Sản phẩm", note: `Kỳ: ${periodLabel}`,
                columns: [{ header: "SKU", key: "sku" }, { header: "Sản phẩm", key: "name", width: 28 }, { header: "Nhập kho trong kỳ", key: "inQty", fmt: "int" }, { header: "Đang có", key: "stock", fmt: "int" }, { header: "Giá vốn", key: "cost", fmt: "money" }, { header: "Giá trị tồn", key: "value", fmt: "money" }],
                rows: prodRows.map(r => ({ sku: r.p.sku, name: r.p.name, inQty: r.inQty, stock: r.stock, cost: r.cost, value: r.stock * r.cost })) },
            ]} />
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`Tiền nhập năm ${year}`} value={<span className="text-[20px]">{vnd(yearTotal)}</span>} sub={`${inYear.length} lần nhập`} tone="brand" />
        <StatCard label={month ? `Tiền nhập tháng ${month}` : "Trung bình / tháng"} value={<span className="text-[20px]">{vnd(month ? periodTotal : yearTotal / 12)}</span>} sub={month ? `${inPeriod.length} lần nhập` : "chia đều 12 tháng"} />
        <StatCard label="Giá trị tồn phụ liệu" value={<span className="text-[20px]">{vnd(matStockValue)}</span>} sub={`${s.materials.length} mã phụ liệu`} tone="brown" />
        <StatCard label="Thành phẩm đang có" value={nf(sum(prodRows, r => r.stock))} unit="cái" sub={`giá trị ${vnd(fgValue)}`} tone="ok" />
      </div>

      <Panel title={`Tiền nhập phụ liệu theo tháng · ${year}`} icon={ChartColumn}>
        {yearTotal > 0
          ? <MonthBars values={byMonth} counts={countByMonth} selected={month} onPick={setMonth} />
          : <EmptyState>Năm {year} chưa có lần nhập kho nào.</EmptyState>}
      </Panel>

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

      <Panel title={`Sản phẩm · nhập kho thành phẩm ${periodLabel}`} icon={PackageCheck} flush>
        <TableWrap>
          <table className="wl-table">
            <thead><tr><th>SKU</th><th>Sản phẩm</th><th className="r">Nhập kho trong kỳ</th><th className="r">Đang có</th><th className="r">Giá vốn hiện tại</th><th className="r">Giá trị tồn</th></tr></thead>
            <tbody>
              {prodRows.length ? prodRows.map(r => (
                <tr key={r.p.id}>
                  <td className="num font-bold text-brand">{r.p.sku}</td>
                  <td className="font-serif">{r.p.name}</td>
                  <td className="r num">{r.inQty ? `+${nf(r.inQty)}` : "–"}</td>
                  <td className="r num font-semibold">{nf(r.stock)}</td>
                  <td className="r num">{vnd(r.cost)}</td>
                  <td className="r num">{vnd(r.stock * r.cost)}</td>
                </tr>
              )) : <tr><td colSpan={6}><EmptyState>Chưa có sản phẩm.</EmptyState></td></tr>}
            </tbody>
            {prodRows.length > 0 && (
              <tfoot><tr>
                <td colSpan={2}>Tổng</td>
                <td className="r num">+{nf(sum(prodRows, r => r.inQty))}</td>
                <td className="r num">{nf(sum(prodRows, r => r.stock))}</td>
                <td />
                <td className="r num">{vnd(fgValue)}</td>
              </tr></tfoot>
            )}
          </table>
        </TableWrap>
      </Panel>

      <Panel title={`Bảng số liệu theo tháng · ${year}`} icon={Table2} flush>
        <TableWrap>
          <table className="wl-table">
            <thead><tr><th>Tháng</th><th className="r">Lần nhập</th><th className="r">Tiền nhập phụ liệu</th><th className="r">Thành phẩm nhập kho</th></tr></thead>
            <tbody>
              {MONTHS.map(m => {
                const fgm = sum(s.finishedTxns.filter(t => { const d = ymVN(t.at); return d.y === year && d.m === m; }), t => t.qty);
                return (
                  <tr key={m} className={cn(month === m && "bg-brand-soft/40", !byMonth[m - 1] && !fgm && "text-muted-foreground")}>
                    <td>Tháng {m}</td>
                    <td className="r num">{countByMonth[m - 1] || "–"}</td>
                    <td className="r num font-semibold">{byMonth[m - 1] ? vnd(byMonth[m - 1]) : "–"}</td>
                    <td className="r num">{fgm ? `${nf(fgm)} cái` : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr>
              <td>Cả năm</td>
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
