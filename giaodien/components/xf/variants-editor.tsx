"use client";

import { Plus, Trash2 } from "lucide-react";
import type { ProductVariant } from "@core";
import { Button } from "@/components/ui/button";

const QUICK = ["S", "M", "L", "XL"];

// Nhập danh sách size + SKU riêng từng size (giống phiên bản trên Sapo)
export function VariantsEditor({ value, onChange, baseSku }: {
  value: ProductVariant[]; onChange: (v: ProductVariant[]) => void; baseSku?: string;
}) {
  const set = (i: number, patch: Partial<ProductVariant>) => onChange(value.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const addQuick = () => {
    const have = new Set(value.map(v => v.size.toUpperCase()));
    onChange([...value, ...QUICK.filter(z => !have.has(z)).map(size => ({ size, sku: "" }))]);
  };
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="eyebrow">Size & SKU riêng từng size</span>
        {baseSku && <span className="text-[11.5px] text-subtle">SKU chung của mẫu: <b className="num">{baseSku.toUpperCase()}</b></span>}
      </div>
      {value.length > 0 && (
        <div className="mb-2 flex flex-col gap-1.5">
          {value.map((v, i) => (
            <div key={i} className="row-in grid grid-cols-[80px_minmax(0,1fr)_36px] items-center gap-2">
              <input aria-label={`Size dòng ${i + 1}`} placeholder="Size" maxLength={10} className="field-input !min-h-9 !py-1.5 text-center font-bold uppercase"
                value={v.size} onChange={e => set(i, { size: e.target.value })} />
              <input aria-label={`SKU size ${v.size || i + 1}`} placeholder="SKU của size này, VD: PVN5748" maxLength={20} className="field-input num !min-h-9 !py-1.5 uppercase"
                value={v.sku} onChange={e => set(i, { sku: e.target.value })} />
              <button type="button" aria-label={`Xóa size ${v.size}`} onClick={() => onChange(value.filter((_, j) => j !== i))}
                className="rounded-md p-1.5 text-subtle hover:bg-bad-soft hover:text-bad">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <Button type="button" size="sm" variant="secondary" onClick={() => onChange([...value, { size: "", sku: "" }])}><Plus /> Thêm size</Button>
        {QUICK.some(z => !value.some(v => v.size.toUpperCase() === z)) && (
          <Button type="button" size="sm" variant="secondary" onClick={addQuick}>Thêm nhanh S · M · L · XL</Button>
        )}
      </div>
    </div>
  );
}
