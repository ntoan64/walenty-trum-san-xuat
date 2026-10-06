"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { matches } from "@/lib/search";
import { useStore } from "@/lib/store";
import { usePopoverPos } from "@/lib/use-popover-pos";

const MAX = 8;

// Ô tìm kiếm dùng chung: gõ từng chữ là xổ gợi ý (tên sản phẩm, mã phụ liệu, xưởng / NCC, mã lệnh…), bấm để chọn.
// options: gợi ý riêng của trang; không truyền thì lấy từ toàn bộ dữ liệu.
export function SearchBox({ value, onChange, placeholder = "Tìm…", className, label = "Tìm kiếm", options }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string; label?: string; options?: string[];
}) {
  const { data: s } = useStore();
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const pos = usePopoverPos(box, open && !!value);
  const all = useMemo(() => options ?? [...new Set([
    ...s.products.map(p => p.name),
    ...s.products.map(p => p.category).filter((x): x is string => !!x),
    ...s.materials.map(m => `${m.code} ${m.name}`),
    ...s.workshops.map(w => w.name),
    ...s.orders.map(o => o.code),
    ...s.repairs.map(r => r.code),
  ])], [options, s.products, s.materials, s.workshops, s.orders, s.repairs]);
  const found = value.trim() ? all.filter(x => x !== value && matches(value, x)).slice(0, MAX) : [];
  const pick = (x: string) => { onChange(x); setOpen(false); setHi(-1); };
  return (
    <div ref={box} className={cn("relative w-full sm:w-64", className)} onBlur={e => { if (!box.current?.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" />
      <input
        type="search" role="combobox" aria-expanded={open && found.length > 0} aria-controls={listId} autoComplete="off"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onFocus={() => setOpen(true)}
        onChange={e => { onChange(e.target.value); setOpen(true); setHi(-1); }}
        onKeyDown={e => {
          if (e.key === "ArrowDown") { e.preventDefault(); setHi(h => Math.min(h + 1, found.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi(h => Math.max(h - 1, -1)); }
          else if (e.key === "Enter" && hi >= 0 && found[hi]) { e.preventDefault(); pick(found[hi]); }
          else if (e.key === "Escape") setOpen(false);
        }}
        className="field-input !min-h-9 !bg-surface !py-1.5 !pr-8 !pl-8"
      />
      {value && (
        <button type="button" aria-label="Xóa tìm kiếm" onClick={() => onChange("")}
          className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-subtle hover:bg-surface-3 hover:text-fg">
          <X className="size-3.5" />
        </button>
      )}
      {open && found.length > 0 && (
        <ul id={listId} role="listbox" style={pos} className="overflow-auto rounded-lg border border-line bg-surface p-1 shadow-lg">
          {found.map((x, i) => (
            <li key={x} role="option" aria-selected={hi === i}>
              <button type="button" tabIndex={-1} onMouseEnter={() => setHi(i)} onMouseDown={e => e.preventDefault()} onClick={() => pick(x)}
                className={cn("w-full truncate rounded-md px-2 py-1.5 text-left text-[13px]", hi === i ? "bg-brand-soft" : "hover:bg-surface-2")}>
                {x}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
