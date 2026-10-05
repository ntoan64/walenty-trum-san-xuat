"use client";

import { Info, Plus, Trash2 } from "lucide-react";
import { byId, materialCost, PRODUCT_STATUS, sum, type BomLine, type ItemStatus } from "@core";
import { Button } from "@/components/ui/button";
import { matches } from "@/lib/search";
import { SearchBox } from "@/components/xf/search-box";
import { useStore, A } from "@/lib/store";
import { useConfirmAction } from "@/lib/use-action";
import { nf, vnd } from "@/lib/format";
import { Summary } from "@/components/xf/confirm-provider";
import { Collapsible } from "@/components/xf/collapsible";
import { StatusSelect } from "@/components/xf/status-select";
import { useDraft } from "@/lib/use-draft";
import { CalcHint, EmptyState, Field, NumberField, PageHeader, Panel, TableWrap } from "@/components/xf/basics";

/* ---------- Thêm sản phẩm: SKU, tên, tiền công, định mức phụ liệu ---------- */
function CreateProduct() {
  const { data: s } = useStore();
  const act = useConfirmAction();
  const usable = s.materials.filter(m => m.status === "active");
  const [f, setF] = useDraft("product:f", { sku: "", name: "", labor: "50000" });
  const [bom, setBom] = useDraft<{ key: number; material: string; qty: string }[]>("product:bom", () => [{ key: 1, material: usable[0]?.id ?? "", qty: "1" }]);
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
          ["Tiền công may", vnd(+f.labor || 0)], ["Giá vốn hiện tại", `${vnd(cost)}/cái`], ["Tình trạng", "Đang sản xuất"],
        ]} />,
      },
      "product.manage", A.createProduct, { sku: f.sku, name: f.name, laborCost: +f.labor || 0, bom: lines },
    );
    if (r?.ok) { setF({ sku: "", name: "", labor: f.labor }); setBom([{ key: seq, material: usable[0]?.id ?? "", qty: "1" }]); setSeq(seq + 1); }
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

        <CalcHint>
          Giá vốn = phụ liệu <span className="num">{vnd(mat)}</span> + tiền công <span className="num">{vnd(+f.labor || 0)}</span> = <b className="num">{vnd(cost)}/cái</b>
        </CalcHint>
        <div><Button type="submit">Thêm sản phẩm</Button></div>
      </form>
    </Collapsible>
  );
}

export default function ProductsPage() {
  const { data: s, can } = useStore();
  const act = useConfirmAction();
  const manage = can("product.manage");
  const [q, setQ] = useDraft("products:q", "");
  const products = s.products.filter(p => matches(q, p.sku, p.name, p.bom.map(l => s.materials.find(m => m.id === l.material)?.name).join(" ")));

  const changeStatus = (id: string, status: ItemStatus) => {
    const p = byId(s.products, id)!;
    act(
      {
        title: `Đổi tình trạng ${p.sku}?`, confirmLabel: "Đổi tình trạng",
        description: (
          <>
            <Summary rows={[["Sản phẩm", `${p.sku} · ${p.name}`], ["Từ", PRODUCT_STATUS[p.status]], ["Sang", PRODUCT_STATUS[status]]]} />
            <p className="mt-2 text-xs">
              {status === "active" ? "Tạo lệnh sản xuất lại được." : "Không tạo lệnh mới cho sản phẩm này. Lệnh đang chạy vẫn tiếp tục."}
            </p>
          </>
        ),
      },
      "product.manage", A.setProductStatus, id, status,
    );
  };

  return (
    <>
      <PageHeader
        eyebrow={<>Phân hệ kho <span className="text-subtle">/</span> <span className="text-subtle">Sản phẩm</span></>}
        title="Sản phẩm & giá vốn"
        desc="Giá vốn = phụ liệu theo định mức × giá bình quân + tiền công may."
      />
      {manage && <CreateProduct />}
      <SearchBox value={q} onChange={setQ} placeholder="Tìm SKU, tên sản phẩm, phụ liệu…" label="Tìm sản phẩm" className="sm:w-80" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-5">
        {!products.length && <div className="col-span-full"><EmptyState>{s.products.length ? "Không tìm thấy sản phẩm." : "Chưa có sản phẩm nào."}</EmptyState></div>}
        {products.map(p => {
          const mat = materialCost(p, s.materials);
          return (
            <Panel
              key={p.id} flush
              className={p.status === "discontinued" ? "opacity-70" : ""}
              title={<span className="flex flex-col"><span className="num text-[11.5px] font-bold text-brown">{p.sku}</span>{p.name}</span>}
              actions={<StatusSelect id={`ps-${p.id}`} value={p.status} labels={PRODUCT_STATUS} editable={manage} onChange={v => changeStatus(p.id, v)} />}
            >
              <TableWrap>
                <table className="wl-table !min-w-0">
                  <thead><tr><th>Phụ liệu</th><th className="r">Định mức</th><th className="r">Thành tiền</th></tr></thead>
                  <tbody>
                    {p.bom.map(l => {
                      const m = byId(s.materials, l.material)!;
                      return (
                        <tr key={l.material}>
                          <td>{m.name}{m.status !== "active" && <span className="ml-1 text-xs text-warn">({m.status === "paused" ? "tạm ngưng" : "ngừng dùng"})</span>}</td>
                          <td className="r num">{nf(l.qtyPerUnit, 2)} {m.unit}</td>
                          <td className="r num">{vnd(l.qtyPerUnit * m.avgPrice)}</td>
                        </tr>
                      );
                    })}
                    <tr><td>Tiền công may</td><td className="r text-muted-foreground">gia công</td><td className="r num">{vnd(p.laborCost)}</td></tr>
                  </tbody>
                  <tfoot><tr><td colSpan={2} className="font-serif text-brand">Giá vốn / cái</td><td className="r num text-brand">{vnd(mat + p.laborCost)}</td></tr></tfoot>
                </table>
              </TableWrap>
            </Panel>
          );
        })}
      </div>
      <Panel>
        <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-brown" />
          Khi tạo lệnh, giá vốn được chốt vào lệnh. Nhập phụ liệu giá mới chỉ ảnh hưởng các lệnh tạo sau đó. Sản phẩm tạm ngưng hoặc ngừng sản xuất không tạo lệnh mới được.
        </p>
      </Panel>
    </>
  );
}
