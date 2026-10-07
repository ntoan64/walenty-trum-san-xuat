"use client";

import { useId, useRef, useState } from "react";
import { Plus, Search } from "lucide-react";
import { MATERIAL_CATEGORIES, type Material } from "@core";
import { matches } from "@/lib/search";
import { nf } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Dropdown } from "./dropdown";

const MAX = 30;

// Ô tìm phụ liệu: gõ mã / tên / nhà cung cấp → chọn; không có thì tạo mới với tên vừa gõ
export function MaterialPicker({ materials, value, onPick, onNew, label }: {
  materials: Material[]; value?: Material; onPick: (m: Material) => void; onNew: (name: string) => void; label: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const found = materials.filter(m => matches(q, m.code, m.name, m.supplier, m.supplierCode, MATERIAL_CATEGORIES[m.category])).slice(0, MAX);
  // nút tạo mới để trên cùng: nhiều kết quả quá thì nằm cuối bị khuất, không thấy để bấm
  const exact = found.some(m => m.name.trim().toLowerCase() === q.trim().toLowerCase());
  const options = [...(q.trim() && !exact ? [{ m: undefined }] : []), ...found.map(m => ({ m }))];
  const pick = (i: number) => {
    const o = options[i];
    if (!o) return;
    if (o.m) onPick(o.m); else onNew(q.trim());
    setQ(""); setOpen(false);
  };

  return (
    <div ref={box} className="relative" onBlur={e => { if (!box.current?.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" />
        <input
          aria-label={label} role="combobox" aria-expanded={open} aria-controls={listId} autoComplete="off"
          className="field-input !min-h-9 !py-1.5 !pl-8"
          placeholder={value ? `${value.code} · ${value.name}` : "Tìm mã, tên phụ liệu…"}
          value={q}
          onFocus={() => setOpen(true)}
          onChange={e => { setQ(e.target.value); setOpen(true); setHi(0); }}
          onKeyDown={e => {
            if (e.key === "ArrowDown") { e.preventDefault(); setHi(h => Math.min(h + 1, options.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
            else if (e.key === "Enter" && open && options.length) { e.preventDefault(); pick(hi === 0 && !options[0].m && options[1] ? 1 : hi); } // Enter mặc định chọn kết quả đầu, muốn tạo mới thì bấm chuột
            else if (e.key === "Escape") setOpen(false);
          }}
        />
      </div>
      {value && !q && (
        <div className="mt-1 truncate text-[12.5px]">
          <b className="num text-brand">{value.code}</b> · {value.name}
          <span className="text-subtle"> · tồn {nf(value.stock, 1)} {value.unit}</span>
        </div>
      )}
      <Dropdown anchor={box} open={open && (!!q || !value)} id={listId}>
          {options.map((o, i) => (
            <li key={o.m?.id ?? "new"} role="option" aria-selected={hi === i}>
              <button type="button" tabIndex={-1} onMouseEnter={() => setHi(i)} onMouseDown={e => e.preventDefault()} onClick={() => pick(i)}
                className={cn("flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[13px]", hi === i ? "bg-brand-soft" : "hover:bg-surface-2")}>
                {o.m ? (
                  <>
                    <span className="min-w-0 truncate"><b className="num text-brand">{o.m.code}</b> · {o.m.name}
                      {o.m.supplier && <span className="text-subtle"> · {o.m.supplier}</span>}
                      {o.m.status === "paused" && <span className="text-warn"> (tạm ngưng)</span>}
                    </span>
                    <span className="num shrink-0 text-xs text-subtle">{nf(o.m.stock, 1)} {o.m.unit}</span>
                  </>
                ) : (
                  <span className="flex items-center gap-1.5 font-semibold text-brand"><Plus className="size-4" /> Tạo phụ liệu mới “{q.trim()}”</span>
                )}
              </button>
            </li>
          ))}
          {!options.length && <li className="px-2 py-1.5 text-[13px] text-muted-foreground">Gõ để tìm, hoặc gõ tên để tạo phụ liệu mới.</li>}
        </Dropdown>
    </div>
  );
}
