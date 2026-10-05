"use client";

import type { ItemStatus } from "@core";
import { cn } from "@/lib/utils";
import { StatusPill, type PillTone } from "./basics";

const TONE: Record<ItemStatus, PillTone> = { active: "ok", paused: "warn", discontinued: "muted" };
const SEL: Record<ItemStatus, string> = {
  active: "bg-ok-soft text-ok", paused: "bg-warn-soft text-warn", discontinued: "bg-surface-2 text-muted-foreground",
};

// Có quyền: ô chọn tô màu theo tình trạng. Không quyền: chỉ hiện nhãn.
export function StatusSelect({ id, value, labels, onChange, editable }: {
  id: string; value: ItemStatus; labels: Record<ItemStatus, string>;
  onChange: (s: ItemStatus) => void; editable: boolean;
}) {
  if (!editable) return <StatusPill tone={TONE[value]} dot>{labels[value]}</StatusPill>;
  return (
    <>
      <label htmlFor={id} className="sr-only">Tình trạng</label>
      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value as ItemStatus)}
        className={cn("min-h-8 cursor-pointer rounded-full border-0 py-1 pr-7 pl-3 text-[12px] font-semibold", SEL[value])}
      >
        {(Object.keys(labels) as ItemStatus[]).map(k => <option key={k} value={k}>{labels[k]}</option>)}
      </select>
    </>
  );
}
