"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { byId, type Product } from "@core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore, A } from "@/lib/store";
import { useAction } from "@/lib/use-action";
import { NumberField } from "./basics";

// Khai báo / sửa định mức phụ liệu + tiền công cho sản phẩm (vd mẫu nhập từ Sapo chưa có)
export function BomDialog({ p, onClose }: { p: Product; onClose: () => void }) {
  const { data: s } = useStore();
  const act = useAction();
  const usable = s.materials.filter(m => m.status !== "discontinued");
  const [labor, setLabor] = useState(String(p.laborCost || ""));
  const [bom, setBom] = useState(p.bom.length
    ? p.bom.map(l => ({ material: l.material, qty: String(l.qtyPerUnit) }))
    : [{ material: usable[0]?.id ?? "", qty: "1" }]);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const r = await act("product.manage", A.setProductBom, p.id, { laborCost: +labor || 0, bom: bom.map(b => ({ material: b.material, qtyPerUnit: +b.qty || 0 })) });
    setBusy(false);
    if (r.ok) onClose();
  };
  return (
    <Dialog open onOpenChange={x => { if (!x) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg text-brand">Định mức · {p.name}</DialogTitle>
          <DialogDescription>Phụ liệu cho 1 sản phẩm và tiền công may. Có định mức mới tạo lệnh sản xuất được.</DialogDescription>
        </DialogHeader>
        {usable.length ? (
          <div className="flex flex-col gap-1.5">
            {bom.map((b, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_100px_auto_32px] items-center gap-2">
                <select aria-label={`Phụ liệu ${i + 1}`} className="field-input !min-h-9 !py-1.5" value={b.material}
                  onChange={e => setBom(bom.map((x, j) => (j === i ? { ...x, material: e.target.value } : x)))}>
                  {usable.map(m => <option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}
                </select>
                <input aria-label={`Định mức ${i + 1}`} type="number" min={0} step="any" className="field-input num !min-h-9 !py-1.5" value={b.qty}
                  onChange={e => setBom(bom.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
                <span className="w-10 text-xs text-subtle">{byId(s.materials, b.material)?.unit}</span>
                <button type="button" aria-label="Xóa dòng" disabled={bom.length === 1} onClick={() => setBom(bom.filter((_, j) => j !== i))}
                  className="rounded-md p-1.5 text-subtle hover:bg-bad-soft hover:text-bad disabled:opacity-30"><Trash2 className="size-4" /></button>
              </div>
            ))}
            <div><Button type="button" size="sm" variant="secondary" onClick={() => setBom([...bom, { material: usable[0]?.id ?? "", qty: "1" }])}><Plus /> Thêm phụ liệu</Button></div>
          </div>
        ) : <p className="text-[13px] text-bad">Chưa có phụ liệu trong kho. Nhập phụ liệu ở trang Kho nguyên phụ liệu trước.</p>}
        <NumberField id="bom-labor" label="Tiền công may (đ/cái)" min={0} step="any" value={labor} onChange={setLabor} />
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button onClick={save} disabled={busy || !usable.length}>Lưu định mức</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
