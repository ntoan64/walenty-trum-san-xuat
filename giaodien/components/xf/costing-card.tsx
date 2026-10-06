"use client";

import { useState } from "react";
import { Calculator, Pencil } from "lucide-react";
import { bomOf, byId, colorsOf, costBreakdown, costRatio, formulaPrice, priceRange, type Product } from "@core";
import { useStore, A } from "@/lib/store";
import { useAskAction } from "@/lib/use-action";
import { nf, pct, vnd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BomDialog } from "./bom-dialog";
import { SearchPicker } from "./search-picker";

function Row({ label, sub, value, strong }: { label: React.ReactNode; sub?: React.ReactNode; value: number; strong?: boolean }) {
  return (
    <tr className="border-t border-line">
      <td className="px-3 py-1.5">{label}{sub && <div className="text-[11px] text-subtle">{sub}</div>}</td>
      <td className={cn("num px-3 py-1.5 text-right whitespace-nowrap", strong && "font-semibold")}>{vnd(value)}</td>
    </tr>
  );
}

// Công may: chọn xưởng → chọn loại may trong bảng giá gia công của xưởng (tự điền giá, sửa được)
function LaborEdit({ productId, color, labor, workshopId, sewType, editable }: { productId: string; color?: string; labor: number; workshopId?: string; sewType?: string; editable: boolean }) {
  const { data: s } = useStore();
  const act = useAskAction();
  const [ws, setWs] = useState(workshopId ?? "");
  const [item, setItem] = useState(sewType ?? "");
  const [v, setV] = useState(String(labor || ""));
  const w = s.workshops.find(x => x.id === ws);
  const changed = ws !== (workshopId ?? "") || item !== (sewType ?? "") || (+v || 0) !== labor;
  if (!editable) return null;
  return (
    <div className="rounded-lg bg-surface-low p-3">
      <div className="eyebrow mb-1">Công may</div>
      <div className="flex flex-col gap-1.5">
        <SearchPicker label="Xưởng may" placeholder="Chọn xưởng may…" value={ws}
          items={s.workshops.filter(x => x.active).map(x => ({ id: x.id, label: x.name, sub: x.area, search: [x.contactName, ...(x.aliases ?? [])] }))}
          onPick={id => { setWs(id); setItem(""); }} />
        {!!w?.rates?.length && (
          <select aria-label="Loại may" className="field-input !min-h-9 !py-1.5 text-[13px]" value={item} onChange={e => {
            setItem(e.target.value);
            const r = w.rates!.find(x => x.item === e.target.value);
            if (r?.price != null) setV(String(r.price));
          }}>
            <option value="">— Chọn loại may trong bảng giá —</option>
            {w.rates.map(r => <option key={r.item} value={r.item}>{r.item}{r.price != null ? ` · ${vnd(r.price)}` : r.note ? ` · ${r.note}` : ""}</option>)}
          </select>
        )}
        <div className="flex items-center gap-2">
          <input aria-label="Công may (đ/cái)" type="number" min={0} step="any" className="field-input num !min-h-9 !w-36 !py-1.5" value={v} onChange={e => setV(e.target.value)} />
          <span className="text-muted-foreground">đ/cái</span>
          <button type="button" disabled={!changed || !ws} onClick={() => act("product.manage", A.setCostLabor, productId, { labor: +v || 0, color, workshopId: ws, sewType: item })}
            className={cn("rounded-md px-2.5 py-1 text-xs font-semibold", changed && ws ? "bg-brand text-brand-fg hover:bg-brand-strong" : "text-subtle")}>{changed ? "Lưu" : "✓"}</button>
        </div>
        {!ws && <p className="text-[11.5px] text-warn">Chọn xưởng may trước.</p>}
      </div>
    </div>
  );
}

// Tỉ lệ cost mục tiêu (%), sửa được
function TargetRatio({ productId, color, target, editable }: { productId: string; color?: string; target?: number; editable: boolean }) {
  const act = useAskAction();
  const [v, setV] = useState(target ? String(Math.round(target * 1000) / 10) : "");
  const [busy, setBusy] = useState(false);
  const n = +v.replace(",", ".") || 0;
  const changed = Math.abs(n / 100 - (target ?? 0)) > 0.0001;
  const save = async () => { setBusy(true); await act("product.manage", A.setCostRatio, productId, { ratio: n / 100, color }); setBusy(false); };
  return (
    <div className="rounded-lg bg-surface-low p-3">
      <div className="eyebrow">Tỉ lệ cost mục tiêu</div>
      {editable ? (
        <div className="mt-1 flex items-center gap-2">
          <input aria-label="Tỉ lệ cost mục tiêu (%)" type="number" min={1} max={99} step="0.5" className="field-input num !min-h-9 !w-24 !py-1.5" value={v} onChange={e => setV(e.target.value)} />
          <span className="text-muted-foreground">%</span>
          <button type="button" disabled={!changed || busy || !(n > 0 && n < 100)} onClick={save}
            className={cn("rounded-md px-2.5 py-1 text-xs font-semibold", changed ? "bg-brand text-brand-fg hover:bg-brand-strong" : "text-subtle")}>{changed ? "Lưu" : "✓"}</button>
        </div>
      ) : <div className="font-serif text-xl font-bold">{target ? pct(target) : "—"}</div>}
      <div className="mt-1 text-[11.5px] text-subtle">Dùng tính giá bán theo công thức và so với tỉ lệ thực tế.</div>
    </div>
  );
}

// Bảng tính giá 1 sản phẩm: giá vốn = vải (định mức kho hoặc file tính giá) + công may + phụ liệu
export function CostingCard({ p }: { p: Product }) {
  const { data: s, can } = useStore();
  const colors = colorsOf(p);
  // các "phiên bản tính giá": chung + màu có định mức / bảng giá riêng
  const keys = [...new Set([
    ...(p.bom.length || p.costing?.[""] ? [""] : []),
    ...colors.filter(c => p.bomByColor?.[c]?.length || p.costing?.[c]),
  ])];
  const [k, setK] = useState(keys[0] ?? "");
  const [edit, setEdit] = useState<string | null>(null);
  const color = k || undefined;
  const b = costBreakdown(p, s.materials, color);
  const c = b.costing;
  const bom = bomOf(p, color);
  const sapoPrice = priceRange((p.variants ?? []).filter(v => !color || v.color === color).map(v => v.price));
  const price = c?.listPrice ?? sapoPrice?.[1];
  const ratio = costRatio(b.total, price);
  const target = c?.ratio;
  const ws = c?.workshop ? byId(s.workshops, c.workshop) : undefined;
  const accRows: [string, number | undefined][] = [
    ["Tag", c?.acc?.tag], ["Thêu logo", c?.acc?.logo], ["Phụ kiện đi kèm", c?.acc?.extra], ["Cúc áo", c?.acc?.buttons], ["Ép keo", c?.acc?.fusing], ["Chi phí khác (quà tặng kèm…)", c?.other],
  ];

  return (
    <div className="reveal min-w-0 rounded-xl border border-line bg-surface shadow-[0_4px_16px_rgba(31,27,26,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h3 className="flex items-center gap-1.5 font-serif text-[15px] font-semibold text-brand"><Calculator className="size-4" /> Giá vốn dự trù</h3>
        <div className="flex flex-wrap items-center gap-1">
          {keys.length > 1 && keys.map(x => (
            <button key={x || "_"} type="button" aria-pressed={k === x} onClick={() => setK(x)}
              className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", k === x ? "bg-brand text-brand-fg" : "bg-surface-2 text-muted-foreground hover:bg-surface-3")}>
              {x || "Chung"}
            </button>
          ))}
          {can("product.manage") && (
            <button type="button" onClick={() => setEdit(k)} className="ml-1 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
              <Pencil className="size-3.5" /> {bom.length ? "Sửa định mức" : "Khai báo định mức"}{color ? ` (${color})` : ""}
            </button>
          )}
        </div>
      </div>
      {!keys.length && !c ? (
        <p className="px-4 py-3 text-[13px] text-muted-foreground">Chưa có định mức hay bảng tính giá cho mẫu này.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="overflow-hidden rounded-lg border border-line">
            <table className="w-full text-[13px]">
              <tbody>
                {b.fabricFrom === "bom" ? bom.map(l => {
                  const m = byId(s.materials, l.material);
                  return <Row key={l.material} label={<><span className="num mr-1.5 text-xs font-bold text-brown">{m?.code}</span>{m?.name}</>}
                    sub={`${nf(l.qtyPerUnit, 2)} ${m?.unit} × ${vnd(m?.avgPrice ?? 0)} (giá BQ kho)`} value={l.qtyPerUnit * (m?.avgPrice ?? 0)} />;
                }) : <>
                  {c?.fabric && <Row label={<>Vải chính <span className="text-muted-foreground">· {c.fabric.name ?? "—"}</span></>} sub={`${nf(c.fabric.qty, 2)} m × ${vnd(c.fabric.price)} (theo file tính giá)`} value={c.fabric.qty * c.fabric.price} />}
                  {c?.lining && <Row label={<>Vải lót <span className="text-muted-foreground">· {c.lining.name ?? "—"}</span></>} sub={`${nf(c.lining.qty, 2)} m × ${vnd(c.lining.price)}`} value={c.lining.qty * c.lining.price} />}
                </>}
                <Row label={<>Công may <span className="text-muted-foreground">· may tại <b className="text-fg">{ws?.name ?? c?.workshopName ?? "chưa chọn xưởng"}</b></span></>} sub={c?.sewType} value={b.labor} />
                {accRows.filter(([, v]) => v).map(([l, v]) => <Row key={l} label={l} value={v!} />)}
                <tr className="border-t border-line bg-surface-low font-semibold">
                  <td className="px-3 py-2 font-serif text-brand">Giá vốn / cái</td>
                  <td className="num px-3 py-2 text-right text-brand">{vnd(b.total)}</td>
                </tr>
              </tbody>
            </table>
            {b.fabricFrom === "file" && <p className="border-t border-line px-3 py-1.5 text-[11.5px] text-warn">Vải đang tính theo file tính giá. Khai báo định mức để trừ kho và tính theo giá bình quân thực tế.</p>}
            {c?.zipper ? <p className="border-t border-line px-3 py-1.5 text-[11.5px] text-subtle">Dây kéo {vnd(c.zipper)} (file ghi riêng, không cộng vào phụ liệu).</p> : null}
          </div>
          <div className="flex flex-col gap-2 text-[13px]">
            {target ? (
              <div className="rounded-lg bg-surface-low p-3">
                <div className="eyebrow">Giá bán theo công thức</div>
                <div className="font-serif text-xl font-bold text-brand">{vnd(formulaPrice(b.total, target))}</div>
                <div className="text-[11.5px] text-subtle">giá vốn ÷ {pct(target)} cost mong muốn × 1,08 VAT</div>
              </div>
            ) : null}
            <div className="rounded-lg bg-surface-low p-3">
              <div className="eyebrow">Giá đang bán</div>
              <div className="font-serif text-xl font-bold">{price ? vnd(price) : "—"}</div>
              <div className="text-[11.5px] text-subtle">
                {c?.listPrice ? "giá áp dụng trong file tính giá" : "giá bán lẻ Sapo"}
                {c?.listPrice && sapoPrice && sapoPrice[1] !== c.listPrice ? ` · Sapo ${vnd(sapoPrice[1])}` : ""}
              </div>
            </div>
            {price ? (
              <div className={cn("rounded-lg p-3", target && ratio > target + 0.02 ? "bg-bad-soft" : "bg-surface-low")}>
                <div className="eyebrow">Tỉ lệ cost thực tế</div>
                <div className={cn("font-serif text-xl font-bold", target && ratio > target + 0.02 ? "text-bad" : "text-ok")}>{pct(ratio)}</div>
                <div className="text-[11.5px] text-subtle">giá vốn ÷ (giá bán ÷ 1,08)</div>
              </div>
            ) : null}
            <LaborEdit key={`lab-${p.id}-${k}-${b.labor}-${c?.workshop ?? ""}`} productId={p.id} color={color} labor={b.labor} workshopId={c?.workshop} sewType={c?.sewType} editable={can("product.manage")} />
            <TargetRatio key={`${p.id}-${k}-${target ?? ""}`} productId={p.id} color={color} target={target} editable={can("product.manage")} />
            {(c?.rating || c?.updated) && <p className="text-[12px] text-muted-foreground">{c.rating && <>Đánh giá: <b className="text-fg">{c.rating}</b></>}{c.updated && <> · cập nhật {c.updated.split("-").reverse().join("/")}</>}</p>}
          </div>
        </div>
      )}
      {edit !== null && <BomDialog p={p} color={edit || undefined} onClose={() => setEdit(null)} />}
    </div>
  );
}
