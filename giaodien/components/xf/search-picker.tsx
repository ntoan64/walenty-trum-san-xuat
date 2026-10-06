"use client";

import { useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import { matches } from "@/lib/search";
import { cn } from "@/lib/utils";

export interface PickItem { id: string; label: string; sub?: string; search?: (string | undefined)[] }

const MAX = 30;

// Ô chọn có tìm kiếm: gõ để lọc thay vì xổ cả danh sách
export function SearchPicker({ items, value, onPick, label, placeholder, id }: {
  items: PickItem[]; value?: string; onPick: (id: string) => void; label: string; placeholder?: string; id?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const cur = items.find(x => x.id === value);
  const found = items.filter(x => matches(q, x.label, x.sub, ...(x.search ?? []))).slice(0, MAX);
  const pick = (i: number) => { const x = found[i]; if (!x) return; onPick(x.id); setQ(""); setOpen(false); };
  return (
    <div ref={box} className="relative" onBlur={e => { if (!box.current?.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
      <input
        id={id} aria-label={label} role="combobox" aria-expanded={open} aria-controls={listId} autoComplete="off"
        className="field-input !pl-9" placeholder={cur ? cur.label : placeholder ?? "Gõ để tìm…"}
        value={open ? q : cur?.label ?? q}
        onFocus={() => { setOpen(true); setQ(""); }}
        onChange={e => { setQ(e.target.value); setOpen(true); setHi(0); }}
        onKeyDown={e => {
          if (e.key === "ArrowDown") { e.preventDefault(); setHi(h => Math.min(h + 1, found.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
          else if (e.key === "Enter" && open) { e.preventDefault(); pick(hi); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && q && (
        <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-line bg-surface p-1 shadow-lg">
          {found.map((x, i) => (
            <li key={x.id} role="option" aria-selected={hi === i}>
              <button type="button" tabIndex={-1} onMouseEnter={() => setHi(i)} onMouseDown={e => e.preventDefault()} onClick={() => pick(i)}
                className={cn("flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[13px]", hi === i ? "bg-brand-soft" : "hover:bg-surface-2")}>
                <span className="min-w-0 truncate">{x.label}</span>
                {x.sub && <span className="shrink-0 text-xs text-subtle">{x.sub}</span>}
              </button>
            </li>
          ))}
          {!found.length && <li className="px-2 py-1.5 text-[13px] text-muted-foreground">Không tìm thấy.</li>}
        </ul>
      )}
    </div>
  );
}
