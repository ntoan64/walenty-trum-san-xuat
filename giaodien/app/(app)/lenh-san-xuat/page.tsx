"use client";

import { useRouter } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";
import { byId, DAY, needFor, shortages, sum, unitCost, unusableMaterials, type Step } from "@core";
import { Button } from "@/components/ui/button";
import { useStore, A } from "@/lib/store";
import { matches } from "@/lib/search";
import { SearchBox } from "@/components/xf/search-box";
import { useConfirmAction } from "@/lib/use-action";
import { Summary } from "@/components/xf/confirm-provider";
import { isoDateVN, nf, vnd } from "@/lib/format";
import { CalcHint, EmptyState, Field, PageHeader, Panel, StatCard, StatusPill } from "@/components/xf/basics";
import { OrderCard } from "@/components/xf/order-card";
import { useDraft } from "@/lib/use-draft";
import { balanceOf } from "@/lib/selectors";

const COLS: [Step, string][] = [["cut", "Chờ cắt"], ["sew", "Đang may"], ["qc", "QC"], ["done", "Hoàn thành"]];

const DEFAULT_SIZES = ["S", "M", "L", "XL"];

function CreateOrder() {
  const { data: s, can } = useStore();
  const act = useConfirmAction();
  const router = useRouter();
  const [open, setOpen] = useDraft("order:open", false);
  const products = s.products.filter(x => x.status === "active");
  const today = isoDateVN(new Date());
  const [f, setF] = useDraft("order:f", () => ({ product: products[0]?.id ?? "", ws: "", due: isoDateVN(new Date(Date.now() + 5 * DAY)) }));
  // Số lượng theo size; thêm size khác (XS, XXL, free size…) bằng ô bên dưới
  const [sizes, setSizes] = useDraft<{ size: string; qty: string }[]>("order:sizes", () => DEFAULT_SIZES.map(z => ({ size: z, qty: "" })));
  const [extra, setExtra] = useDraft("order:extra", "");
  const p = byId(products, f.product) ?? products[0];
  const sizeList = sizes.map(x => ({ size: x.size, qty: Math.floor(+x.qty || 0) })).filter(x => x.qty > 0);
  const qty = sizeList.reduce((t, x) => t + x.qty, 0);
  const workshops = s.workshops.filter(w => w.active);
  const ws = workshops.find(w => w.id === f.ws) ?? workshops[0];
  if (!workshops.length) return can("order.create") ? <Panel><EmptyState>Chưa có xưởng nào đang hợp tác. Thêm xưởng ở trang Xưởng may trước khi tạo lệnh.</EmptyState></Panel> : null;
  if (!p) return can("order.create") ? <Panel><EmptyState>Chưa có sản phẩm nào đang sản xuất. Thêm hoặc mở lại sản phẩm ở trang Sản phẩm & giá vốn.</EmptyState></Panel> : null;
  const unusable = unusableMaterials(p, s.materials);
  const short = qty > 0 ? shortages(p, qty, s.materials) : [];
  const need = needFor(p, qty, s.materials);
  const cost = unitCost(p, s.materials);
  if (!can("order.create")) return null;

  const addSize = () => {
    const z = extra.trim().toUpperCase();
    if (z && !sizes.some(x => x.size === z)) setSizes([...sizes, { size: z, qty: "" }]);
    setExtra("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await act(
      {
        title: "Tạo lệnh sản xuất?",
        confirmLabel: "Tạo lệnh",
        description: (
          <Summary rows={[
            ["Sản phẩm", `${p.sku} · ${p.name}`],
            ["Xưởng", ws.name],
            ["Theo size", sizeList.map(x => `${x.size}: ${x.qty}`).join(" · ")],
            ["Tổng", `${qty} cái`],
            ["Dự kiến xong", f.due.split("-").reverse().join("/")],
            ["Xuất kho", need.map(n => `${n.material.code} ${nf(n.qty, 1)} ${n.material.unit}`).join(" · ")],
            ["Giá vốn", `${vnd(cost)}/cái · tổng ${vnd(cost * qty)}`],
          ]} />
        ),
      },
      "order.create", A.createOrder, { productId: p.id, workshopId: ws.id, sizes: sizeList, dueDate: f.due },
    );
    if (r?.ok && r.id) router.push(`/lenh-san-xuat/${r.id}`);
  };

  return (
    <section className="card overflow-hidden rounded-xl">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 bg-surface-low px-4 py-3 text-left md:px-5"
      >
        <span className="flex items-center gap-2 font-serif text-[16px] font-semibold text-brand">
          <Plus className="size-5" /> Tạo lệnh sản xuất mới
        </span>
        <ChevronDown className={`size-5 text-subtle transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <form onSubmit={submit} className="flex flex-col gap-4 p-4 md:p-5">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] items-end gap-3">
            <Field label="Sản phẩm" htmlFor="o-prod">
              <select id="o-prod" className="field-input" value={p.id} onChange={e => setF({ ...f, product: e.target.value })}>
                {products.map(x => <option key={x.id} value={x.id}>{x.sku} · {x.name}</option>)}
              </select>
            </Field>
            <Field label="Xưởng cắt + may" htmlFor="o-ws">
              <select id="o-ws" className="field-input" value={ws.id} onChange={e => setF({ ...f, ws: e.target.value })}>
                {workshops.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Field>
            <Field label="Ngày dự kiến xong" htmlFor="o-due">
              <input id="o-due" type="date" min={today} className="field-input num" value={f.due} onChange={e => setF({ ...f, due: e.target.value })} />
            </Field>
          </div>

          <div>
            <div className="eyebrow mb-1.5">Số lượng theo size</div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2">
              {sizes.map((x, i) => (
                <label key={x.size} className="flex flex-col gap-1 rounded-lg bg-surface-2 p-2">
                  <span className="flex items-center justify-between text-xs font-bold text-brand">
                    {x.size}
                    {!DEFAULT_SIZES.includes(x.size) && (
                      <button type="button" aria-label={`Bỏ size ${x.size}`} className="text-subtle hover:text-bad" onClick={() => setSizes(sizes.filter((_, j) => j !== i))}>×</button>
                    )}
                  </span>
                  <input type="number" min={0} step={1} inputMode="numeric" placeholder="0" aria-label={`Số lượng size ${x.size}`}
                    className="field-input num !min-h-9 !bg-surface !py-1.5" value={x.qty}
                    onChange={e => setSizes(sizes.map((y, j) => (j === i ? { ...y, qty: e.target.value } : y)))} />
                </label>
              ))}
              <div className="flex flex-col gap-1 rounded-lg border border-dashed border-line-strong p-2">
                <span className="text-xs text-muted-foreground">Size khác</span>
                <div className="flex gap-1">
                  <input aria-label="Thêm size" placeholder="XXL" className="field-input !min-h-9 !py-1.5 uppercase" value={extra}
                    onChange={e => setExtra(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSize(); } }} />
                  <button type="button" aria-label="Thêm size" onClick={addSize} className="rounded-md bg-surface-3 px-2 text-brand hover:bg-surface-4"><Plus className="size-4" /></button>
                </div>
              </div>
            </div>
            <p className="mt-1.5 text-[13px]">Tổng <b className="num text-brand">{qty}</b> cái</p>
          </div>

          {unusable.length ? (
            <CalcHint bad>
              <b>Phụ liệu không dùng được:</b> {unusable.map(m => `${m.code} (${m.status === "paused" ? "tạm ngưng" : "ngừng dùng"})`).join(" · ")}. Mở lại ở Kho phụ liệu hoặc sửa định mức.
            </CalcHint>
          ) : short.length ? (
            <CalcHint bad>
              <b>Không đủ phụ liệu:</b> {short.map(n => `${n.material.code} cần ${nf(n.qty, 1)}, còn ${nf(n.material.stock, 1)} ${n.material.unit}`).join(" · ")}
            </CalcHint>
          ) : qty > 0 ? (
            <CalcHint>
              Sẽ xuất kho: {need.map(n => `${n.material.code} ${nf(n.qty, 1)} ${n.material.unit}`).join(" · ")}
              <br />
              Giá vốn chốt cho lệnh: <b>{vnd(cost)}/cái</b> · tổng <b>{vnd(cost * qty)}</b>
            </CalcHint>
          ) : null}
          <div>
            <Button type="submit" disabled={!!short.length || !!unusable.length || qty <= 0}>Tạo lệnh + xuất phụ liệu</Button>
          </div>
        </form>
      )}
    </section>
  );
}

export default function OrdersPage() {
  const { data: s } = useStore();
  const now = new Date();
  const [q, setQ] = useDraft("orders:q", "");
  // tìm theo mã lệnh, sản phẩm, SKU, xưởng, size
  const found = s.orders.filter(o => {
    const p = byId(s.products, o.product), w = byId(s.workshops, o.workshop);
    return matches(q, o.code, p?.name, p?.sku, w?.name, o.sizes?.map(z => z.size).join(" "));
  });
  const open = s.orders.filter(o => o.step !== "done");
  const units = sum(open, o => o.qty);
  const late = open.filter(o => o.dueAt < now).length;
  const pq = sum(open, o => balanceOf(s, o).pendingQC);

  return (
    <>
      <PageHeader
        eyebrow={<>Phân hệ sản xuất <span className="text-subtle">/</span> <span className="text-subtle">Lệnh sản xuất</span></>}
        title="Lệnh sản xuất"
        desc="Bấm vào một lệnh để xem cân đối số lượng và thao tác."
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
        {q && <span className="text-[13px] text-muted-foreground">Tìm thấy <b className="num text-fg">{found.length}</b> lệnh</span>}
      </div>
      <div className="grid grid-cols-1 items-start gap-3 min-[560px]:grid-cols-2 min-[1400px]:grid-cols-4">
        {COLS.map(([k, label]) => {
          const list = found.filter(o => o.step === k);
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
    </>
  );
}
