"use client";

import { Fragment, useState } from "react";
import { ChevronRight, Info, Pencil, Plus, Shirt, Trash2 } from "lucide-react";
import Link from "next/link";
import { byId, costBreakdown, costOf, displayColor, hasBom, isLive, materialCost, priceRange, PRODUCT_STATUS, sapoStock, sum, type BomLine, type ItemStatus, type Product, type ProductVariant } from "@core";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VariantsEditor } from "@/components/xf/variants-editor";
import { SapoSheetPanel } from "@/components/xf/sapo-sheet";
import { BomDialog } from "@/components/xf/bom-dialog";
import { fmtRange, ProductThumb, SapoVariants } from "@/components/xf/sapo-product";
import { CostingCard } from "@/components/xf/costing-card";
import { Button } from "@/components/ui/button";
import { matches } from "@/lib/search";
import { SearchBox } from "@/components/xf/search-box";
import { useStore, A } from "@/lib/store";
import { useAction, useConfirmAction } from "@/lib/use-action";
import { fmtD, nf, vnd } from "@/lib/format";
import { Summary } from "@/components/xf/confirm-provider";
import { Collapsible } from "@/components/xf/collapsible";
import { StatusSelect } from "@/components/xf/status-select";
import { useDraft } from "@/lib/use-draft";
import { CalcHint, EmptyState, Field, NumberField, PageHeader, Panel, StatCard, TableWrap } from "@/components/xf/basics";
import { finishedStock } from "@/lib/selectors";
import { cn } from "@/lib/utils";

/* ---------- Thêm sản phẩm: SKU, tên, tiền công, định mức phụ liệu ---------- */
function CreateProduct() {
  const { data: s } = useStore();
  const act = useConfirmAction();
  const usable = s.materials.filter(m => m.status === "active");
  const [f, setF] = useDraft("product:f", { sku: "", name: "", labor: "50000" });
  const [bom, setBom] = useDraft<{ key: number; material: string; qty: string }[]>("product:bom", () => [{ key: 1, material: usable[0]?.id ?? "", qty: "1" }]);
  const [variants, setVariants] = useDraft<ProductVariant[]>("product:variants", []);
  const [seq, setSeq] = useDraft("product:seq", 2);

  const lines: BomLine[] = bom.filter(b => b.material).map(b => ({ material: b.material, qtyPerUnit: +b.qty || 0 }));
  const mat = sum(lines, l => l.qtyPerUnit * (byId(s.materials, l.material)?.avgPrice ?? 0));
  const cost = mat + (+f.labor || 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await act(
      {
        title: "Thêm sản phẩm mới?", confirmLabel: "Thêm sản phẩm",
        description: <Summary rows={[
          ["SKU", f.sku.trim().toUpperCase()], ["Tên", f.name],
          ...lines.map(l => { const m = byId(s.materials, l.material)!; return [m.name, `${nf(l.qtyPerUnit, 2)} ${m.unit}`] as [string, string]; }),
          ["Tiền công may", vnd(+f.labor || 0)], ["Giá vốn hiện tại", `${vnd(cost)}/cái`],
          ...(variants.length ? [["Size & SKU", variants.map(v => `${v.size.toUpperCase()}: ${v.sku.toUpperCase()}`).join(" · ")] as [string, string]] : []),
          ["Tình trạng", "Đang sản xuất"],
        ]} />,
      },
      "product.manage", A.createProduct, { sku: f.sku, name: f.name, laborCost: +f.labor || 0, bom: lines, variants },
    );
    if (r?.ok) { setF({ sku: "", name: "", labor: f.labor }); setVariants([]); setBom([{ key: seq, material: usable[0]?.id ?? "", qty: "1" }]); setSeq(seq + 1); }
  };

  return (
    <Collapsible title="Thêm sản phẩm mới" icon={Plus}>
      <form onSubmit={submit} className="flex flex-col gap-4 p-4 md:p-5">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] items-end gap-3">
          <Field label="SKU" htmlFor="np-sku">
            <input id="np-sku" className="field-input num uppercase" placeholder="VD: DM05" value={f.sku} onChange={e => setF({ ...f, sku: e.target.value })} />
          </Field>
          <Field label="Tên sản phẩm" htmlFor="np-name" className="sm:col-span-2">
            <input id="np-name" className="field-input" placeholder="VD: Đầm midi lụa" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
          </Field>
          <NumberField id="np-labor" label="Tiền công may (đ/cái)" min={0} step="any" value={f.labor} onChange={v => setF({ ...f, labor: v })} />
        </div>

        <div>
          <div className="eyebrow mb-1.5">Định mức phụ liệu cho 1 sản phẩm</div>
          <div className="flex flex-col gap-1.5">
            {bom.map((b, i) => {
              const m = byId(s.materials, b.material);
              return (
                <div key={b.key} className="row-in grid grid-cols-[minmax(0,1fr)_110px_auto_36px] items-center gap-2">
                  <select aria-label={`Phụ liệu dòng ${i + 1}`} className="field-input" value={b.material}
                    onChange={e => setBom(bom.map(x => (x.key === b.key ? { ...x, material: e.target.value } : x)))}>
                    {usable.map(x => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
                  </select>
                  <input aria-label={`Định mức dòng ${i + 1}`} type="number" min={0} step="any" className="field-input num" value={b.qty}
                    onChange={e => setBom(bom.map(x => (x.key === b.key ? { ...x, qty: e.target.value } : x)))} />
                  <span className="w-12 text-xs text-subtle">{m?.unit}</span>
                  <button type="button" aria-label={`Xóa dòng ${i + 1}`} disabled={bom.length === 1}
                    onClick={() => setBom(bom.filter(x => x.key !== b.key))}
                    className="rounded-md p-1.5 text-subtle hover:bg-bad-soft hover:text-bad disabled:opacity-30">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
          <Button type="button" size="sm" variant="secondary" className="mt-2"
            onClick={() => { setBom([...bom, { key: seq, material: usable.find(u => !bom.some(b => b.material === u.id))?.id ?? usable[0]?.id ?? "", qty: "1" }]); setSeq(seq + 1); }}>
            <Plus /> Thêm phụ liệu
          </Button>
        </div>

        <VariantsEditor value={variants} onChange={setVariants} baseSku={f.sku} />

        <CalcHint>
          Giá vốn = phụ liệu <span className="num">{vnd(mat)}</span> + tiền công <span className="num">{vnd(+f.labor || 0)}</span> = <b className="num">{vnd(cost)}/cái</b>
        </CalcHint>
        <div><Button type="submit">Thêm sản phẩm</Button></div>
      </form>
    </Collapsible>
  );
}

/* ---------- Chi tiết 1 sản phẩm khi bấm vào dòng ---------- */
/* ---------- Sửa size + SKU của sản phẩm đã có ---------- */
function VariantsDialog({ p, onClose }: { p: Product; onClose: () => void }) {
  const act = useAction();
  const [list, setList] = useState<ProductVariant[]>(p.variants?.length ? p.variants : []);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const r = await act("product.manage", A.setProductVariants, p.id, list);
    setBusy(false);
    if (r.ok) onClose();
  };
  return (
    <Dialog open onOpenChange={x => { if (!x) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg text-brand">Size & SKU · {p.sku}</DialogTitle>
          <DialogDescription>{p.name}. Mỗi size một mã SKU riêng (giống phiên bản trên Sapo).</DialogDescription>
        </DialogHeader>
        <VariantsEditor value={list} onChange={setList} baseSku={p.sku} />
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button onClick={save} disabled={busy}>Lưu size & SKU</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProductDetail({ p, mat, stock }: { p: Product; mat: number; stock: number }) {
  const { data: s, can } = useStore();
  const [editVariants, setEditVariants] = useState(false);
  const [editBom, setEditBom] = useState(false);
  const total = mat + p.laborCost;
  const matPct = total ? (mat / total) * 100 : 0;
  const orders = s.orders.filter(o => o.product === p.id).slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const live = orders.filter(isLive);
  const STEP: Record<string, string> = { cut: "Chờ cắt", sew: "Đang may", qc: "QC", done: "Hoàn thành" };
  return (
    <div className="reveal grid grid-cols-1 gap-4 rounded-xl border border-line bg-surface p-4 shadow-[0_4px_16px_rgba(31,27,26,0.05)] lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      {/* Định mức */}
      <div className="min-w-0">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 className="font-serif text-[15px] font-semibold text-brand">Định mức cho 1 sản phẩm</h3>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            {p.bom.length ? `${p.bom.length} phụ liệu` : hasBom(p) ? <span>Định mức riêng theo màu: {Object.keys(p.bomByColor ?? {}).join(", ")} (xem Tính giá)</span> : <span className="text-warn">Chưa có định mức, chưa tạo lệnh được</span>}
            {can("product.manage") && (
              <button type="button" onClick={() => setEditBom(true)} className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">
                <Pencil className="size-3.5" /> {p.bom.length ? "Sửa" : "Khai báo"}
              </button>
            )}
          </span>
        </div>
        <div className="overflow-hidden rounded-lg border border-line">
          <table className="w-full text-[13px]">
            <thead className="bg-surface-low text-left text-[11px] tracking-[0.06em] text-muted-foreground uppercase">
              <tr><th className="px-3 py-2">Phụ liệu</th><th className="px-3 py-2 text-right">Định mức</th><th className="px-3 py-2 text-right">Giá BQ</th><th className="px-3 py-2 text-right">Thành tiền</th></tr>
            </thead>
            <tbody>
              {p.bom.map(l => {
                const m = byId(s.materials, l.material)!;
                return (
                  <tr key={l.material} className="border-t border-line">
                    <td className="px-3 py-2">
                      <span className="num mr-1.5 text-xs font-bold text-brown">{m.code}</span>{m.name}
                      {m.status !== "active" && <span className="ml-1 text-xs text-warn">({m.status === "paused" ? "tạm ngưng" : "ngừng dùng"})</span>}
                      <div className="text-[11.5px] text-subtle">Tồn kho {nf(m.stock, 1)} {m.unit} · đủ làm ~{l.qtyPerUnit ? nf(Math.floor(m.stock / l.qtyPerUnit)) : "—"} cái</div>
                    </td>
                    <td className="num px-3 py-2 text-right whitespace-nowrap">{nf(l.qtyPerUnit, 2)} {m.unit}</td>
                    <td className="num px-3 py-2 text-right text-muted-foreground">{vnd(m.avgPrice)}</td>
                    <td className="num px-3 py-2 text-right">{vnd(l.qtyPerUnit * m.avgPrice)}</td>
                  </tr>
                );
              })}
              <tr className="border-t border-line">
                <td className="px-3 py-2">Tiền công may</td><td className="px-3 py-2 text-right text-muted-foreground">gia công</td><td />
                <td className="num px-3 py-2 text-right">{vnd(p.laborCost)}</td>
              </tr>
              <tr className="border-t border-line bg-surface-low font-semibold">
                <td colSpan={3} className="px-3 py-2 font-serif text-brand">Giá vốn / cái</td>
                <td className="num px-3 py-2 text-right text-brand">{vnd(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Tóm tắt */}
      <div className="flex min-w-0 flex-col gap-3">
        <div className="rounded-lg bg-surface-low p-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="eyebrow">Size & SKU</span>
            {can("product.manage") && (
              <button type="button" onClick={() => setEditVariants(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
                <Pencil className="size-3.5" /> {p.variants?.length ? "Sửa" : "Thêm size"}
              </button>
            )}
          </div>
          {p.variants?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {p.variants.map(v => (
                <span key={v.sku} className="inline-flex items-center gap-1.5 rounded-md bg-surface px-2 py-1 text-[12.5px] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                  <b className="text-brand">{v.size}</b>{v.color && <span className="text-muted-foreground">{v.color}</span>}<span className="num text-muted-foreground">{v.sku}</span>
                </span>
              ))}
            </div>
          ) : <p className="text-[12.5px] text-muted-foreground">Chưa khai báo SKU theo size.</p>}
          {editVariants && <VariantsDialog p={p} onClose={() => setEditVariants(false)} />}
          {editBom && <BomDialog p={p} onClose={() => setEditBom(false)} />}
        </div>
        <div className="rounded-lg bg-surface-low p-3">
          <div className="eyebrow mb-1.5">Cơ cấu giá vốn</div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`Phụ liệu ${Math.round(matPct)}%, tiền công ${100 - Math.round(matPct)}%`}>
            <i className="block h-full bg-brand" style={{ width: `${matPct}%` }} />
            <i className="block h-full bg-brown/70" style={{ width: `${100 - matPct}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[12px]">
            <span><span className="mr-1 inline-block size-2 rounded-full bg-brand" />Phụ liệu <b className="num">{vnd(mat)}</b> <span className="text-subtle">({Math.round(matPct)}%)</span></span>
            <span><span className="mr-1 inline-block size-2 rounded-full bg-brown/70" />Tiền công <b className="num">{vnd(p.laborCost)}</b></span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-surface-low p-3">
            <div className="eyebrow">Thành phẩm đang có</div>
            <div className="font-serif text-xl font-bold text-ok">{nf(stock)} <span className="font-sans text-xs font-normal text-muted-foreground">cái</span></div>
            <div className="text-[11.5px] text-subtle">≈ {vnd(stock * total)}</div>
          </div>
          <div className="rounded-lg bg-surface-low p-3">
            <div className="eyebrow">Lệnh đang chạy</div>
            <div className="font-serif text-xl font-bold text-brand">{live.length} <span className="font-sans text-xs font-normal text-muted-foreground">lệnh</span></div>
            <div className="text-[11.5px] text-subtle">{nf(live.reduce((t, o) => t + o.qty, 0))} cái đang làm</div>
          </div>
        </div>
        <div>
          <div className="eyebrow mb-1">Lệnh gần đây</div>
          {orders.length ? (
            <ul className="flex flex-col gap-1">
              {orders.slice(0, 4).map(o => (
                <li key={o.id}>
                  <Link href={`/lenh-san-xuat/${o.id}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-surface-2">
                    <span><b className="num text-brand">{o.code}</b> · <span className="num">{o.qty}</span> cái</span>
                    <span className={cn("text-xs", o.cancelled ? "text-bad" : "text-muted-foreground")}>{o.cancelled ? "Đã hủy" : STEP[o.step]} · {fmtD(o.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="text-[13px] text-muted-foreground">Chưa có lệnh nào.</p>}
        </div>
        {can("order.create") && p.status === "active" && (
          <Link href="/lenh-san-xuat" className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-[13px] font-semibold text-brand-fg hover:bg-brand-strong">
            <Plus className="size-4" /> Tạo lệnh sản xuất
          </Link>
        )}
      </div>
    </div>
  );
}

type SortKey = "new" | "name" | "sku" | "cost" | "stock";
const PAGE = 20;

export default function ProductsPage() {
  const { data: s, can } = useStore();
  const act = useConfirmAction();
  const manage = can("product.manage");
  const [q, setQ] = useDraft("products:q", "");
  const [status, setStatus] = useDraft<"all" | ItemStatus>("products:status", "all");
  const [sort, setSort] = useDraft<SortKey>("products:sort", "new");
  const [cat, setCat] = useDraft("products:cat", "");
  const cats = [...new Set(s.products.map(p => p.category).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "vi"));
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const stock = finishedStock(s);

  const rows = s.products
    .map((p, i) => ({ p, i, mat: materialCost(p, s.materials), cost: costOf(p, s.materials), stock: stock[p.id] ?? 0, sapo: sapoStock(p) }))
    .filter(r => status === "all" || r.p.status === status)
    .filter(r => !cat || r.p.category === cat)
    .filter(r => matches(q, r.p.sku, r.p.name, r.p.category, r.p.brand, r.p.tags?.join(" "),
      r.p.variants?.map(v => `${v.sku} ${v.barcode ?? ""} ${v.size} ${v.color ?? ""}`).join(" "), r.p.bom.map(l => s.materials.find(m => m.id === l.material)?.name).join(" ")))
    .sort((a, b) =>
      sort === "name" ? a.p.name.localeCompare(b.p.name, "vi")
      : sort === "sku" ? a.p.sku.localeCompare(b.p.sku, "vi", { numeric: true })
      : sort === "cost" ? b.cost - a.cost
      : sort === "stock" ? b.sapo + b.stock - (a.sapo + a.stock)
      : b.i - a.i); // mới thêm lên đầu
  const shown = rows.slice(0, limit);
  const count = (k: "all" | ItemStatus) => s.products.filter(p => k === "all" || p.status === k).length;

  const changeStatus = (id: string, next: ItemStatus) => {
    const p = byId(s.products, id)!;
    act(
      {
        title: `Đổi tình trạng ${p.sku}?`, confirmLabel: "Đổi tình trạng",
        description: (
          <>
            <Summary rows={[["Sản phẩm", `${p.sku} · ${p.name}`], ["Từ", PRODUCT_STATUS[p.status]], ["Sang", PRODUCT_STATUS[next]]]} />
            <p className="mt-2 text-xs">
              {next === "active" ? "Tạo lệnh sản xuất lại được." : "Không tạo lệnh mới cho sản phẩm này. Lệnh đang chạy vẫn tiếp tục."}
            </p>
          </>
        ),
      },
      "product.manage", A.setProductStatus, id, next,
    );
  };

  return (
    <>
      <PageHeader
        eyebrow={<>Phân hệ kho <span className="text-subtle">/</span> <span className="text-subtle">Sản phẩm</span></>}
        title="Sản phẩm & giá vốn"
        desc="Đồng bộ từ Sapo (ảnh, phiên bản, tồn, bảng giá). Giá vốn = định mức phụ liệu + tiền công; mẫu chưa khai báo định mức tạm lấy giá nhập Sapo. Bấm một dòng để xem chi tiết."
        aside={
          <div className="grid w-full grid-cols-3 gap-2 min-[1500px]:w-auto">
            <StatCard className="min-[1500px]:min-w-[110px]" label="Sản phẩm" value={s.products.length} unit="mã" tone="brand" />
            <StatCard className="min-[1500px]:min-w-[110px]" label="Đang sản xuất" value={count("active")} unit="mã" tone="ok" />
            <StatCard className="min-[1500px]:min-w-[110px]" label="Tạm / ngừng" value={count("paused") + count("discontinued")} unit="mã" />
          </div>
        }
      />
      {manage && <SapoSheetPanel />}
      {manage && <CreateProduct />}

      <Panel
        title="Danh sách sản phẩm" icon={Shirt} flush
        tag={<span className="num text-xs text-subtle">{rows.length} / {s.products.length}</span>}
        actions={<SearchBox value={q} onChange={v => { setQ(v); setLimit(PAGE); }} placeholder="Tìm tên, SKU, barcode, màu, loại…" label="Tìm sản phẩm" />}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 pb-2 md:px-5">
          <div role="group" aria-label="Lọc tình trạng" className="flex gap-1 overflow-x-auto">
            {([["all", "Tất cả"], ...Object.entries(PRODUCT_STATUS)] as ["all" | ItemStatus, string][]).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={status === k} onClick={() => { setStatus(k); setLimit(PAGE); }}
                className={cn("rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
                  status === k ? "bg-brand text-brand-fg" : "bg-surface-2 text-muted-foreground hover:bg-surface-3")}>
                {label} <span className="num opacity-70">{count(k)}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
          {cats.length > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Loại
              <select className="field-input !min-h-8 !w-40 !bg-surface !py-1 text-xs" value={cat} onChange={e => { setCat(e.target.value); setLimit(PAGE); }}>
                <option value="">Tất cả loại</option>
                {cats.map(c => <option key={c} value={c}>{c} ({s.products.filter(p => p.category === c).length})</option>)}
              </select>
            </label>
          )}
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Sắp xếp
            <select className="field-input !min-h-8 !w-36 !bg-surface !py-1 text-xs" value={sort} onChange={e => setSort(e.target.value as SortKey)}>
              <option value="new">Mới thêm</option>
              <option value="name">Tên A → Z</option>
              <option value="sku">SKU</option>
              <option value="cost">Giá vốn cao → thấp</option>
              <option value="stock">Tồn nhiều → ít</option>
            </select>
          </label>
          </div>
        </div>

        <TableWrap>
          <table className="wl-table">
            <thead>
              <tr>
                <th className="w-8" />
                <th className="w-12">Ảnh</th><th>Sản phẩm</th><th>Loại</th><th>Nhãn hiệu</th>
                <th className="r">Tồn kho</th><th className="r">Giá bán lẻ</th><th className="r">Giá vốn / cái</th><th>Tình trạng</th>
              </tr>
            </thead>
            <tbody>
              {shown.length ? shown.map(({ p, mat, cost, stock: st, sapo }) => {
                const isOpen = open === p.id;
                return (
                  <Fragment key={p.id}>
                    <tr
                      className={cn("cursor-pointer", p.status === "discontinued" && "opacity-60", isOpen && "bg-brand-soft/30")}
                      onClick={() => setOpen(isOpen ? null : p.id)}
                    >
                      <td>
                        <button type="button" aria-expanded={isOpen} aria-label={`${isOpen ? "Thu gọn" : "Xem"} định mức ${p.sku}`}
                          onClick={e => { e.stopPropagation(); setOpen(isOpen ? null : p.id); }}
                          className="grid size-6 place-items-center rounded text-subtle hover:bg-surface-3">
                          <ChevronRight className={cn("size-4 transition-transform duration-200", isOpen && "rotate-90")} />
                        </button>
                      </td>
                      <td className="!py-1.5"><ProductThumb p={p} /></td>
                      <td className="min-w-[180px]">
                        <div className="font-serif font-medium">{p.name}</div>
                        <div className="num text-[11.5px] text-subtle">{p.variants?.[0]?.sku ?? p.sku}{p.variants && p.variants.length > 1 && ` · ${p.variants.length} phiên bản`}</div>
                      </td>
                      <td className="text-[12.5px] whitespace-nowrap">{p.category ?? <span className="text-subtle">—</span>}</td>
                      <td className="text-[12.5px] text-muted-foreground">{p.brand ?? ""}</td>
                      <td className="r num">
                        <b>{nf(p.source === "sapo" ? sapo : st)}</b>
                        {!!p.variants?.length && <div className="text-[11px] font-normal text-subtle">({p.variants.length} phiên bản)</div>}
                        {p.source === "sapo" && st > 0 && <div className="text-[11px] font-normal text-ok" title="Đã nhập kho thành phẩm từ sản xuất trên web">+{nf(st)} SX</div>}
                      </td>
                      <td className="r num whitespace-nowrap">{fmtRange(priceRange(p.variants?.map(v => v.price) ?? []))}</td>
                      <td className="r num whitespace-nowrap">
                        <b className="text-brand">{vnd(cost)}</b>
                        {(() => {
                          const src = costBreakdown(p, s.materials, displayColor(p)).fabricFrom;
                          return <div className={cn("text-[11px] font-normal", src === "bom" ? "text-subtle" : "text-warn")}>
                            {src === "bom" ? "định mức + công + phụ liệu" : src === "file" ? "theo file tính giá · chưa định mức" : "giá nhập Sapo · chưa định mức"}
                          </div>;
                        })()}
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <StatusSelect id={`ps-${p.id}`} value={p.status} labels={PRODUCT_STATUS} editable={manage} onChange={v => changeStatus(p.id, v)} />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="hover:!bg-transparent">
                        <td />
                        <td colSpan={8} className="!pt-0">
                          <div className="flex flex-col gap-3">
                            <SapoVariants p={p} />
                            <CostingCard p={p} />
                            <ProductDetail p={p} mat={mat} stock={st} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              }) : (
                <tr><td colSpan={9}><EmptyState>{s.products.length ? "Không tìm thấy sản phẩm phù hợp." : "Chưa có sản phẩm nào. Thêm ở khối bên trên."}</EmptyState></td></tr>
              )}
            </tbody>
          </table>
        </TableWrap>
        {rows.length > limit && (
          <div className="flex justify-center border-t border-line p-3">
            <Button variant="secondary" size="sm" onClick={() => setLimit(limit + PAGE)}>Xem thêm {Math.min(PAGE, rows.length - limit)} sản phẩm</Button>
          </div>
        )}
      </Panel>

      <p className="flex items-start gap-2 px-1 text-[12.5px] text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-brown" />
        Khi tạo lệnh, giá vốn được chốt vào lệnh. Nhập phụ liệu giá mới chỉ ảnh hưởng các lệnh tạo sau đó. Sản phẩm tạm ngưng hoặc ngừng sản xuất không tạo lệnh mới được.
      </p>
    </>
  );
}
