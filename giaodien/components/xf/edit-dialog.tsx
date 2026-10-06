"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "./basics";

export interface EditField { key: string; label: string; type?: "text" | "number" | "date" | "textarea"; full?: boolean; upper?: boolean }

// Hộp sửa nhanh dùng chung: truyền danh sách ô + giá trị ban đầu, onSave trả true thì đóng
export function EditDialog({ title, desc, fields, initial, onSave, onClose }: {
  title: string; desc?: React.ReactNode; fields: EditField[]; initial: Record<string, string>;
  onSave: (v: Record<string, string>) => Promise<boolean>; onClose: () => void;
}) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); const done = await onSave(v); setBusy(false); if (done) onClose(); };
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg text-brand">{title}</DialogTitle>
          {desc && <DialogDescription>{desc}</DialogDescription>}
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {fields.map(f => (
            <div key={f.key} className={f.full || f.type === "textarea" ? "col-span-2" : ""}>
              <Field label={f.label} htmlFor={`ed-${f.key}`}>
                {f.type === "textarea"
                  ? <textarea id={`ed-${f.key}`} className="field-input min-h-[70px]" value={v[f.key] ?? ""} onChange={e => setV({ ...v, [f.key]: e.target.value })} />
                  : <input id={`ed-${f.key}`} type={f.type === "date" ? "date" : "text"} inputMode={f.type === "number" ? "decimal" : undefined}
                      className={`field-input${f.type === "number" ? " num" : ""}${f.upper ? " uppercase" : ""}`} value={v[f.key] ?? ""} onChange={e => setV({ ...v, [f.key]: e.target.value })} />}
              </Field>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button onClick={save} disabled={busy}>Lưu</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const toNum = (s: string) => Number(s.replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
