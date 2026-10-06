"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { bomOf, byId, type Product } from "@core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore, A } from "@/lib/store";
import { useAskAction } from "@/lib/use-action";
import { NumberField } from "./basics";
import { SearchPicker } from "./search-picker";

// Khai báo / sửa định mức phụ liệu + tiền công cho sản phẩm (vd mẫu nhập từ Sapo chưa có)
// color: định mức riêng cho màu đó (vải khác màu); không truyền = định mức chung
export function BomDialog({ p, color, onClose }: { p: Product; color?: string; onClose: () => void }) {
  const { data: s } = useStore();
  const act = useAskAction();
  const usable = s.materials.filter(m => m.status !== "discontinued");
  const [labor, setLabor] = useState(String(p.laborCost || ""));
  const cur = color ? bomOf(p, color) : p.bom;
  const [bom, setBom] = useState(cur.length
    ? cur.map(l => ({ material: l.material, qty: String(l.qtyPerUnit) }))
    : [{ material: "", qty: "1" }]);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const r = await act("product.manage", A.setProductBom, p.id, { laborCost: +labor || 0, bom: bom.map(b => ({ material: b.material, qtyPerUnit: +b.qty || 0 })), color });
    setBusy(false);
    if (r.ok) onClose();
  };
  return (
    <Dialog open onOpenChange={x => { if (!x) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg text-brand">Định mức · {p.name}{color ? ` · ${color}` : ""}</DialogTitle>
          <DialogDescription>Phụ liệu cho 1 sản phẩm{color ? ` màu ${color}` : ""} và tiền công may. Có định mức mới tạo lệnh sản xuất được.</DialogDescription>
        </DialogHeader>
        {usable.length ? (
          <div className="flex flex-col gap-1.5">
            {bom.map((b, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_100px_auto_32px] items-center gap-2">
                <SearchPicker label={`Phụ liệu ${i + 1}`} placeholder="Gõ mã, tên phụ liệu…" value={b.material}
                  items={usable.map(m => ({ id: m.id, label: `${m.code} · ${m.name}`, sub: m.unit, search: [m.supplier, m.supplierCode] }))}
                  onPick={id => setBom(bom.map((x, j) => (j === i ? { ...x, material: id } : x)))} />
                <input aria-label={`Định mức ${i + 1}`} type="number" min={0} step="any" className="field-input num !min-h-9 !py-1.5" value={b.qty}
                  onChange={e => setBom(bom.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
                <span className="w-10 text-xs text-subtle">{byId(s.materials, b.material)?.unit}</span>
                <button type="button" aria-label="Xóa dòng" disabled={bom.length === 1} onClick={() => setBom(bom.filter((_, j) => j !== i))}
                  className="rounded-md p-1.5 text-subtle hover:bg-bad-soft hover:text-bad disabled:opacity-30"><Trash2 className="size-4" /></button>
              </div>
            ))}
            <div><Button type="button" size="sm" variant="secondary" onClick={() => setBom([...bom, { material: "", qty: "1" }])}><Plus /> Thêm phụ liệu</Button></div>
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
