"use client";

import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { byId, colorsOf, DAY, forColor, hasBom, isLive, needFor, sum, unitCost, type Product, type Step } from "@core";
import { Button } from "@/components/ui/button";
import { useStore, A } from "@/lib/store";
import { matches } from "@/lib/search";
import { SearchBox } from "@/components/xf/search-box";
import { useConfirmAction } from "@/lib/use-action";
import { Summary } from "@/components/xf/confirm-provider";
import { isoDateVN, nf, vnd } from "@/lib/format";
import { CalcHint, EmptyState, Field, PageHeader, Panel, StatCard, StatusPill } from "@/components/xf/basics";
import { OrderCard } from "@/components/xf/order-card";
import { SearchPicker } from "@/components/xf/search-picker";
import { SapoSheetPanel } from "@/components/xf/sapo-sheet";
import { useDraft } from "@/lib/use-draft";
import { balanceOf } from "@/lib/selectors";

const COLS: [Step, string][] = [["cut", "Chờ cắt"], ["sew", "Đang may"], ["qc", "QC"], ["done", "Hoàn thành"]];

const DEFAULT_SIZES = ["S", "M", "L", "XL"];
// size của 1 màu (Sapo: mỗi màu × size là 1 phiên bản), không trùng
const sizesOf = (p: Product | undefined, color?: string) => {
  const vs = (p?.variants ?? []).filter(v => !color || v.color === color);
  const list = [...new Set(vs.map(v => v.size))];
  return list.length ? list : DEFAULT_SIZES;
};

type Line = { key: number; product: string; color: string; sizes: { size: string; qty: string }[]; quick?: string };

// Nhập nhanh số lượng: "1s1m1l1xl", "2S 3M 1XL", "1 custom", "XXL:2" → [{size, qty}]
function parseQuick(text: string) {
  const out: { size: string; qty: number }[] = [];
  const t = text.replace(/,/g, " ");
  const re = /(\d+)\s*([A-Za-zÀ-ỹ]+)|([A-Za-zÀ-ỹ][A-Za-zÀ-ỹ0-9]*)\s*[:=x×]\s*(\d+)/gi;
  for (let m; (m = re.exec(t)); ) {
    const size = (m[2] ?? m[3]).toUpperCase(), qty = +(m[1] ?? m[4]);
    const i = out.findIndex(x => x.size === size);
    if (i >= 0) out[i].qty += qty; else out.push({ size, qty });
  }
  return out;
}

// 1 lệnh = 1 xưởng, nhiều sản phẩm. Tạo lệnh không trừ kho; kho bấm "Xuất phụ liệu" ở trang lệnh mới trừ.
function CreateOrder() {
  const { data: s, can } = useStore();
  const act = useConfirmAction();
  const router = useRouter();
  const [open, setOpen] = useDraft("order:open", false);
  const products = s.products.filter(x => x.status === "active");
  const today = isoDateVN(new Date());
  const [f, setF] = useDraft("order:f2", () => ({ ws: "", due: isoDateVN(new Date(Date.now() + 5 * DAY)) }));
  const [lines, setLines] = useDraft<Line[]>("order:lines", []);
  const [seq, setSeq] = useDraft("order:lseq", 1);
  const workshops = s.workshops.filter(w => w.active && w.kind !== "ncc");
  const ws = workshops.find(w => w.id === f.ws) ?? workshops[0];
  if (!can("order.create")) return null;
  if (!workshops.length) return <Panel><EmptyState>Chưa có xưởng nào đang hợp tác. Thêm xưởng ở trang Xưởng may trước khi tạo lệnh.</EmptyState></Panel>;
  if (!products.length) return <Panel><EmptyState>Chưa có sản phẩm nào đang sản xuất. Thêm hoặc mở lại sản phẩm ở trang Sản phẩm & định mức.</EmptyState></Panel>;

  const set = (key: number, patch: Partial<Line>) => setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = (productId: string) => {
    const p = byId(products, productId);
    const color = p ? colorsOf(p)[0] ?? "" : "";
    setLines([...lines, { key: seq, product: productId, color, sizes: sizesOf(p, color).map(z => ({ size: z, qty: "" })) }]);
    setSeq(seq + 1);
  };
  // số liệu từng dòng
  const rows = lines.map(l => {
    const p0 = byId(products, l.product);
    const colors = p0 ? colorsOf(p0) : [];
    const color = colors.includes(l.color) ? l.color : colors[0];
    const p = p0 ? forColor(p0, color) : undefined;
    const sizeList = l.sizes.map(x => ({ size: x.size, qty: Math.floor(+x.qty || 0) })).filter(x => x.qty > 0);
    const qty = sizeList.reduce((t, x) => t + x.qty, 0);
    const cost = p0 ? unitCost(p0, s.materials, color) : 0;
    return { l, p0, p, colors, color, sizeList, qty, cost, noBom: !p?.bom.length };
  });
  const totalQty = sum(rows, r => r.qty);
  // dự báo phụ liệu cần chuẩn bị cho cả lệnh (chỉ để xem, chưa trừ kho)
  const need = new Map<string, number>();
  for (const r of rows) if (r.p && r.qty) for (const n of needFor(r.p, r.qty, s.materials)) need.set(n.material.id, (need.get(n.material.id) ?? 0) + n.qty);
  const needList = [...need].map(([id, q]) => ({ m: byId(s.materials, id)!, q })).sort((a, b) => (b.q - b.m.stock) - (a.q - a.m.stock));
  const valid = rows.filter(r => r.qty > 0);
  const canSubmit = valid.length > 0 && valid.every(r => !r.noBom);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await act(
      {
        title: "Tạo lệnh sản xuất?", confirmLabel: "Tạo lệnh",
        description: (
          <>
            <Summary rows={[
              ["Xưởng", ws.name],
              ...valid.map(r => [`${r.p0!.name}${r.color ? ` · ${r.color}` : ""}`, `${r.sizeList.map(x => `${x.size}:${x.qty}`).join(" ")} = ${r.qty} cái`] as [string, string]),
              ["Tổng", `${totalQty} cái`],
              ["Dự kiến xong", f.due.split("-").reverse().join("/")],
            ]} />
            <p className="mt-2 text-xs">Tạo lệnh chưa trừ kho. Khi giao phụ liệu cho xưởng, bấm “Xuất phụ liệu” ở trang lệnh.</p>
          </>
        ),
      },
      "order.create", A.createOrders, { workshopId: ws.id, dueDate: f.due, items: valid.map(r => ({ productId: r.p0!.id, color: r.color, sizes: r.sizeList })) },
    );
    if (r?.ok) { setLines([]); if (r.id) router.push(`/lenh-san-xuat/${r.id}`); }
  };

  return (
    <section className="card overflow-hidden rounded-xl">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 bg-surface-low px-4 py-3 text-left md:px-5">
        <span className="flex items-center gap-2 font-serif text-[16px] font-semibold text-brand"><Plus className="size-5" /> Tạo lệnh sản xuất mới</span>
        <ChevronDown className={`size-5 text-subtle transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <form onSubmit={submit} className="flex flex-col gap-4 p-4 md:p-5">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] items-end gap-3">
            <Field label="Xưởng cắt + may" htmlFor="o-ws">
              <SearchPicker id="o-ws" label="Xưởng cắt + may" placeholder="Gõ tên xưởng…" value={ws.id}
                items={workshops.map(w => ({ id: w.id, label: w.name, sub: w.area, search: [w.contactName, ...(w.aliases ?? [])] }))}
                onPick={id => setF({ ...f, ws: id })} />
            </Field>
            <Field label="Ngày dự kiến xong" htmlFor="o-due">
              <input id="o-due" type="date" min={today} className="field-input num" value={f.due} onChange={e => setF({ ...f, due: e.target.value })} />
            </Field>
          </div>

          <div className="flex flex-col gap-2">
            <div className="eyebrow">Sản phẩm trong lệnh</div>
            {rows.map(({ l, p0, colors, color, qty, cost, noBom }, i) => (
              <div key={l.key} className="row-in flex flex-col gap-2 rounded-lg border border-line bg-surface-low/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="num text-xs font-bold text-subtle">{i + 1}.</span>
                  <b className="font-serif text-brand">{p0?.name ?? "?"}</b>
                  {colors.length > 1 && (
                    <select aria-label={`Màu dòng ${i + 1}`} className="field-input !min-h-8 !w-auto !py-1 text-[13px]" value={color} onChange={e => set(l.key, { color: e.target.value, sizes: sizesOf(p0, e.target.value).map(z => ({ size: z, qty: "" })) })}>
                      {colors.map(c => <option key={c} value={c}>{c}{p0!.bomByColor?.[c]?.length || p0!.bom.length ? "" : " (chưa định mức)"}</option>)}
                    </select>
                  )}
                  {colors.length === 1 && <span className="text-[13px] text-muted-foreground">{color}</span>}
                  <span className="ml-auto text-[13px]">{qty > 0 && <><b className="num">{qty}</b> cái{can("price.view") && cost > 0 && <span className="text-muted-foreground"> · {vnd(cost)}/cái</span>}</>}</span>
                  <button type="button" aria-label={`Bỏ dòng ${i + 1}`} onClick={() => setLines(lines.filter(x => x.key !== l.key))} className="rounded-md p-1 text-subtle hover:bg-bad-soft hover:text-bad"><Trash2 className="size-4" /></button>
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2">
                  {l.sizes.map((x, j) => (
                    <label key={x.size} className="flex flex-col gap-1 rounded-lg bg-surface p-2">
                      <span className="flex items-center justify-between text-xs font-bold text-brand">{x.size}
                        {!sizesOf(p0, color).includes(x.size) && <button type="button" aria-label={`Bỏ size ${x.size}`} className="text-subtle hover:text-bad" onClick={() => set(l.key, { sizes: l.sizes.filter((_, k) => k !== j) })}>×</button>}
                      </span>
                      <input type="number" min={0} step={1} inputMode="numeric" placeholder="0" aria-label={`Số lượng ${p0?.name} size ${x.size}`}
                        className="field-input num !min-h-8 !py-1" value={x.qty}
                        onChange={e => set(l.key, { sizes: l.sizes.map((y, k) => (k === j ? { ...y, qty: e.target.value } : y)) })} />
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input aria-label={`Nhập nhanh size dòng ${i + 1}`} placeholder="Nhập nhanh: 1s1m1l1xl, 2 custom, XXL:3…" className="field-input !min-h-8 !w-auto min-w-[220px] flex-1 !py-1 text-[13px]"
                    value={l.quick ?? ""} onChange={e => set(l.key, { quick: e.target.value })}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); (e.currentTarget.nextElementSibling as HTMLButtonElement | null)?.click(); } }} />
                  <Button type="button" size="sm" variant="secondary" onClick={() => {
                    const q = parseQuick(l.quick ?? "");
                    if (!q.length) return;
                    const sizes = [...l.sizes];
                    for (const x of q) {
                      const j = sizes.findIndex(y => y.size.toUpperCase() === x.size);
                      if (j >= 0) sizes[j] = { ...sizes[j], qty: String(x.qty) }; else sizes.push({ size: x.size, qty: String(x.qty) });
                    }
                    set(l.key, { sizes, quick: "" });
                  }}>Điền</Button>
                </div>
                {noBom && <p className="text-[12px] text-bad">Chưa có định mức phụ liệu{color ? ` cho màu ${color}` : ""}. Khai báo ở trang Sản phẩm & định mức trước.</p>}
              </div>
            ))}
            <SearchPicker label="Thêm sản phẩm vào lệnh" placeholder="＋ Gõ tên, SKU để thêm sản phẩm…"
              items={products.map(x => ({ id: x.id, label: x.name, sub: hasBom(x) ? x.category : "chưa định mức", search: [x.sku, x.category, ...(x.variants ?? []).map(v => v.sku)] }))}
              onPick={addLine} />
          </div>

          {needList.length > 0 && (
            <CalcHint bad={needList.some(n => n.q > n.m.stock)}>
              <b>Phụ liệu cần chuẩn bị cho lệnh này</b> <span className="text-muted-foreground">(chưa trừ kho)</span>
              <ul className="mt-1 flex flex-col gap-0.5">
                {needList.map(({ m, q }) => (
                  <li key={m.id} className="flex flex-wrap gap-x-2">
                    <span>•</span><b className="num">{m.code}</b><span className="min-w-0 flex-1">{m.name}</span>
                    <span className="num whitespace-nowrap">cần <b>{nf(q, 1)}</b> · tồn {nf(m.stock, 1)}{q > m.stock && <> · thiếu <b className="text-bad">{nf(q - m.stock, 1)}</b></>} {m.unit}</span>
                  </li>
                ))}
              </ul>
            </CalcHint>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!canSubmit}>Tạo lệnh{valid.length > 1 ? ` (${valid.length} sản phẩm, ${totalQty} cái)` : ""}</Button>
            {!lines.length && <span className="text-[13px] text-muted-foreground">Thêm sản phẩm vào lệnh ở ô bên trên.</span>}
          </div>
        </form>
      )}
    </section>
  );
}

export default function OrdersPage() {
  const { data: s, can } = useStore();
  const now = new Date();
  const [q, setQ] = useDraft("orders:q", "");
  // tìm theo mã lệnh, sản phẩm, SKU, xưởng, size
  const found = s.orders.filter(o => {
    const p = byId(s.products, o.product), w = byId(s.workshops, o.workshop);
    return matches(q, o.code, p?.name, p?.sku, w?.name, o.sizes?.map(z => z.size).join(" "));
  });
  const open = s.orders.filter(isLive);
  const [showCancelled, setShowCancelled] = useDraft("orders:cancelled", false);
  const cancelledList = s.orders.filter(o => o.cancelled);
  const units = sum(open, o => o.qty);
  const late = open.filter(o => o.dueAt < now).length;
  const pq = sum(open, o => balanceOf(s, o).pendingQC);

  return (
    <>
      <PageHeader
        eyebrow={<>Phân hệ sản xuất <span className="text-subtle">/</span> <span className="text-subtle">Lệnh sản xuất</span></>}
        title="Lệnh sản xuất"
        desc="Bấm vào một lệnh để xem tổng thực tế và thao tác."
        aside={
          <div className="grid w-full grid-cols-3 gap-2 min-[1500px]:w-auto">
            <StatCard className="min-[1500px]:min-w-[120px]" label="Đang chạy" value={open.length} unit="lệnh" sub={`${nf(units)} cái`} tone="brand" />
            <StatCard className="min-[1500px]:min-w-[120px]" label="Chờ QC" value={pq} unit="cái" />
            <StatCard className="min-[1500px]:min-w-[120px]" label="Trễ hạn" value={late} unit="lệnh" tone={late ? "alert" : "default"} />
          </div>
        }
      />
      <CreateOrder />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SearchBox value={q} onChange={setQ} placeholder="Tìm mã lệnh, sản phẩm, SKU, xưởng…" label="Tìm lệnh sản xuất" className="sm:w-80" />
        <div className="flex items-center gap-3">
          {q && <span className="text-[13px] text-muted-foreground">Tìm thấy <b className="num text-fg">{found.filter(o => !o.cancelled).length}</b> lệnh</span>}
          {cancelledList.length > 0 && (
            <button type="button" onClick={() => setShowCancelled(!showCancelled)} className="text-[13px] font-semibold text-muted-foreground hover:text-brand">
              {showCancelled ? "Ẩn" : "Xem"} lệnh đã hủy ({cancelledList.length})
            </button>
          )}
        </div>
      </div>
      {showCancelled && cancelledList.length > 0 && (
        <div className="reveal grid grid-cols-1 gap-2 rounded-xl bg-surface-2 p-2.5 sm:grid-cols-2 min-[1400px]:grid-cols-4">
          {found.filter(o => o.cancelled).map(o => <OrderCard key={o.id} s={s} o={o} now={now} />)}
        </div>
      )}
      <div className="grid grid-cols-1 items-start gap-3 min-[560px]:grid-cols-2 min-[1400px]:grid-cols-4">
        {COLS.map(([k, label]) => {
          const list = found.filter(o => o.step === k && !o.cancelled);
          return (
            <div key={k} className="flex min-w-0 flex-col gap-2 rounded-xl bg-surface-low p-2.5">
              <div className="flex items-center justify-between px-1 pt-0.5 pb-1">
                <b className="font-serif text-[14px] text-brand">{label}</b>
                <StatusPill tone="muted"><span className="num">{list.length}</span></StatusPill>
              </div>
              {list.length ? list.map(o => <OrderCard key={o.id} s={s} o={o} now={now} />) : <EmptyState>Trống</EmptyState>}
            </div>
          );
        })}
      </div>
      {can("product.manage") && can("price.view") && <SapoSheetPanel kind="purchase" />}
    </>
  );
}
