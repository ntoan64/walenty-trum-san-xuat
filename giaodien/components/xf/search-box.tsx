"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function SearchBox({ value, onChange, placeholder = "Tìm…", className, label = "Tìm kiếm" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string; label?: string;
}) {
  return (
    <div className={cn("relative w-full sm:w-64", className)}>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" />
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="field-input !min-h-9 !bg-surface !py-1.5 !pr-8 !pl-8"
      />
      {value && (
        <button type="button" aria-label="Xóa tìm kiếm" onClick={() => onChange("")}
          className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-subtle hover:bg-surface-3 hover:text-fg">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
