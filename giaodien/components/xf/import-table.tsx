"use client";

import { PackagePlus, Plus, Trash2 } from "lucide-react";
import {
  byId, DEFAULT_UNIT, MATERIAL_CATEGORIES, nextMaterialCode, previewAvg, sum, UNITS, type MaterialCategory,
} from "@core";
import { Button } from "@/components/ui/button";
import { useStore, A } from "@/lib/store";
import { useConfirmAction } from "@/lib/use-action";
import type { ImportLine } from "@/lib/actions";
import { nf, vnd } from "@/lib/format";
import { Collapsible } from "./collapsible";
import { useDraft } from "@/lib/use-draft";
import { Summary } from "./confirm-provider";
import { MaterialPicker } from "./material-picker";
import { SearchPicker } from "./search-picker";

const NEW = "__new__";
const CATS = Object.entries(MATERIAL_CATEGORIES) as [MaterialCategory, string][];

interface Row {
  key: number;
  material: string; // id hoặc NEW
  category: MaterialCategory; name: string; unit: string;
  qty: string; price: string;
}

const blank = (key: number, material = ""): Row => ({ key, material, category: "vai", name: "", unit: "mét", qty: "", price: "" });
const cell = "field-input !min-h-9 !py-1.5";

// Phiếu nhập kho dạng bảng: nhiều dòng, dòng nào chưa có phụ liệu thì khai báo mới ngay trên dòng (mã tự sinh)
export function ImportTable() {
  const { data: s } = useStore();
  const act = useConfirmAction();
  const usable = s.materials.filter(m => m.status !== "discontinued");
  const [seq, setSeq] = useDraft("import:seq", 2);
  const [rows, setRows] = useDraft<Row[]>("import:rows", () => [blank(1)]);
  const [supplier, setSupplier] = useDraft("import:supplier", "");

  const set = (key: number, patch: Partial<Row>) => setRows(rs => rs.map(r => (r.key === key ? { ...r, ...patch } : r)));
  const add = () => { setRows(rs => [...rs, blank(seq)]); setSeq(seq + 1); };
  const remove = (key: number) => setRows(rs => (rs.length > 1 ? rs.filter(r => r.key !== key) : rs));

  // Mã dự kiến cho từng dòng mới (các dòng mới cùng loại trong phiếu nối số tiếp nhau)
  const codeOf = (r: Row) => {
    const before = rows.slice(0, rows.indexOf(r)).filter(x => x.material === NEW && x.category === r.category).length;
    return nextMaterialCode(r.category, s.materials, before);
  };
  const label = (r: Row) => {
    if (r.material === NEW) return `${codeOf(r)} · ${r.name || "?"} (mới)`;
    const m = byId(s.materials, r.material);
    return m ? `${m.code} · ${m.name}` : "?";
  };
  const unitOf = (r: Row) => (r.material === NEW ? r.unit : byId(s.materials, r.material)?.unit ?? "");
  const total = sum(rows, r => (+r.qty || 0) * (+r.price || 0));

  const toLines = (): ImportLine[] => rows.map(r => ({
    materialId: r.material && r.material !== NEW ? r.material : undefined,
    newMaterial: r.material === NEW ? { name: r.name, unit: r.unit, category: r.category, minStock: 0, okStock: 0 } : undefined,
    qty: +r.qty || 0,
    price: +r.price || 0,
  }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await act(
      {
        title: "Nhập kho phiếu này?",
        confirmLabel: "Nhập kho",
        description: (
          <>
            <Summary rows={[
              ...rows.map(r => [label(r), `${nf(+r.qty || 0, 2)} ${unitOf(r)} × ${vnd(+r.price || 0)}`] as [string, string]),
              ["Nhà cung cấp", supplier.trim() || "Không ghi"],
              ["Tổng tiền", vnd(total)],
            ]} />
            {rows.some(r => r.material === NEW) && <p className="mt-2 text-xs">Phụ liệu mới được tạo với mã tự sinh và tình trạng Đang dùng.</p>}
          </>
        ),
      },
      "material.import", A.importBatch, { supplier, lines: toLines() },
    );
    if (r?.ok) { setRows([blank(seq)]); setSeq(seq + 1); }
  };

  return (
    <Collapsible title="Phiếu nhập kho" icon={PackagePlus} defaultOpen>
      <form onSubmit={submit}>
        {/* Tiêu đề cột: chỉ hiện trên màn rộng, điện thoại mỗi dòng xếp thành thẻ */}
        <div className="hidden grid-cols-[28px_minmax(0,1fr)_130px_140px_120px_110px_36px] gap-3 bg-surface-3 px-4 py-2.5 md:grid md:px-5">
          {["#", "Phụ liệu", "Số lượng", "Đơn giá (đ)", "Thành tiền", "Giá BQ mới", ""].map((h, i) => (
            <span key={i} className={`eyebrow !text-muted-foreground ${i >= 4 && i <= 5 ? "text-right" : ""}`}>{h}</span>
          ))}
        </div>

        <ol className="divide-y divide-line">
          {rows.map((r, i) => {
            const m = r.material !== NEW ? byId(s.materials, r.material) : undefined;
            const q = +r.qty || 0, p = +r.price || 0;
            return (
              <li key={r.key} className="row-in grid grid-cols-2 items-start gap-2 px-4 py-3 md:grid-cols-[28px_minmax(0,1fr)_130px_140px_120px_110px_36px] md:gap-3 md:px-5">
                <span className="num hidden pt-2 text-subtle md:block">{i + 1}</span>

                <div className="col-span-2 flex flex-col gap-1.5 md:col-span-1">
                  <MaterialPicker label={`Phụ liệu dòng ${i + 1}`} materials={usable} value={m}
                    onPick={x => set(r.key, { material: x.id })}
                    onNew={name => set(r.key, { material: NEW, name })} />
                  {r.material === NEW && (
                    <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-brand-soft/50 p-2">
                      <span className="num rounded bg-surface px-2 py-1 text-xs font-bold text-brand" title="Mã tự sinh theo loại">{codeOf(r)}</span>
                      <select aria-label="Loại" className={`${cell} !w-auto`} value={r.category}
                        onChange={e => { const c = e.target.value as MaterialCategory; set(r.key, { category: c, unit: DEFAULT_UNIT[c] }); }}>
                        {CATS.map(([k, lb]) => <option key={k} value={k}>{lb}</option>)}
                      </select>
                      <input aria-label="Tên phụ liệu" placeholder="Tên phụ liệu, VD: Vải lụa đen" className={`${cell} !w-auto min-w-[160px] flex-1`}
                        value={r.name} onChange={e => set(r.key, { name: e.target.value })} />
                      <input aria-label="Đơn vị tính" list="units" className={`${cell} !w-20`} value={r.unit} onChange={e => set(r.key, { unit: e.target.value })} />
                    </div>
                  )}
                </div>

                <label className="flex flex-col gap-1 md:block">
                  <span className="text-xs text-muted-foreground md:sr-only">Số lượng</span>
                  <span className="flex items-center gap-1">
                    <input aria-label={`Số lượng dòng ${i + 1}`} type="number" min={0} step="any" className={`${cell} num`} value={r.qty} onChange={e => set(r.key, { qty: e.target.value })} />
                    <span className="w-8 shrink-0 text-xs text-subtle">{unitOf(r)}</span>
                  </span>
                </label>
                <label className="flex flex-col gap-1 md:block">
                  <span className="text-xs text-muted-foreground md:sr-only">Đơn giá (đ)</span>
                  <input aria-label={`Đơn giá dòng ${i + 1}`} type="number" min={0} step="any" className={`${cell} num`} value={r.price} onChange={e => set(r.key, { price: e.target.value })} />
                </label>

                <div className="num pt-2 font-semibold md:text-right">
                  <span className="mr-1 font-sans text-xs font-normal text-muted-foreground md:hidden">Thành tiền</span>{vnd(q * p)}
                </div>
                <div className="num pt-2 text-brand md:text-right">
                  <span className="mr-1 font-sans text-xs text-muted-foreground md:hidden">Giá BQ mới</span>{q > 0 ? vnd(m ? previewAvg(m, q, p) : p) : "–"}
                </div>
                <button type="button" aria-label={`Xóa dòng ${i + 1}`} disabled={rows.length === 1} onClick={() => remove(r.key)}
                  className="col-span-2 justify-self-end rounded-md p-1.5 text-subtle hover:bg-bad-soft hover:text-bad disabled:opacity-30 md:col-span-1">
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })}
        </ol>

        <datalist id="units">{UNITS.map(u => <option key={u} value={u} />)}</datalist>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-low px-4 py-3 md:px-5">
          <Button type="button" variant="secondary" size="sm" onClick={add}><Plus /> Thêm dòng</Button>
          <span className="text-[13px]">Tổng tiền phiếu <b className="num ml-1 text-brand">{vnd(total)}</b></span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3 p-4 md:px-5">
          <div className="w-full max-w-xs">
            <label htmlFor="ip-sup" className="mb-1 block text-xs font-medium text-muted-foreground">Nhà cung cấp</label>
            <SearchPicker id="ip-sup" label="Nhà cung cấp" placeholder="Gõ tìm trong Xưởng may & NCC…"
              value={s.workshops.find(w => w.name === supplier)?.id}
              items={s.workshops.filter(w => w.active).map(w => ({ id: w.id, label: w.name, sub: w.area, search: [w.contactName, ...(w.aliases ?? [])] }))}
              onPick={id => setSupplier(s.workshops.find(w => w.id === id)?.name ?? "")} />
          </div>
          <Button type="submit">Nhập kho{rows.length > 1 ? ` ${rows.length} dòng` : ""}</Button>
        </div>
      </form>
    </Collapsible>
  );
}
