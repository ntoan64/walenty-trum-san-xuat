"use client";

import { ChevronDown, type LucideIcon } from "lucide-react";
import { useDraft } from "@/lib/use-draft";

// Khối gập có dải tiêu đề, dùng cho các form tạo / nhập
export function Collapsible({ title, icon: Icon, defaultOpen = false, children }: {
  title: string; icon: LucideIcon; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useDraft(`open:${title}`, defaultOpen);
  return (
    <section className="card overflow-hidden rounded-xl">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 bg-surface-low px-4 py-3 text-left md:px-5">
        <span className="flex items-center gap-2 font-serif text-[16px] font-semibold text-brand"><Icon className="size-5" /> {title}</span>
        <ChevronDown className={`size-5 text-subtle transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="reveal">{children}</div>}
    </section>
  );
}
