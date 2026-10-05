"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { thumb, uploadPhoto } from "@/lib/upload";
import { cn } from "@/lib/utils";

// Dãy ảnh nhỏ, bấm để mở ảnh gốc
export function PhotoStrip({ photos, size = 40, className }: { photos?: string[]; size?: number; className?: string }) {
  if (!photos?.length) return null;
  return (
    <span className={cn("inline-flex flex-wrap gap-1 align-middle", className)}>
      {photos.map(u => (
        <a key={u} href={u} target="_blank" rel="noreferrer" title="Xem ảnh lỗi" className="overflow-hidden rounded-md ring-1 ring-line hover:ring-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumb(u, size * 2)} alt="Ảnh lỗi" width={size} height={size} loading="lazy" className="block object-cover" style={{ width: size, height: size }} />
        </a>
      ))}
    </span>
  );
}

// Chọn / chụp ảnh lỗi, tải lên ngay, trả về danh sách link
export function PhotoPicker({ value, onChange, max = 4, label }: { value: string[]; onChange: (v: string[]) => void; max?: number; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const pick = async (files: FileList | null) => {
    const list = Array.from(files ?? []).slice(0, max - value.length);
    if (!list.length) return;
    setBusy(list.length);
    let cur = value;
    for (const f of list) {
      try {
        const url = await uploadPhoto(f);
        cur = [...cur, url];
        onChange(cur);
      } catch (e) {
        toast.error((e as Error).message);
      }
      setBusy(n => n - 1);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map(u => (
        <span key={u} className="relative">
          <PhotoStrip photos={[u]} size={44} />
          <button type="button" aria-label="Bỏ ảnh" onClick={() => onChange(value.filter(x => x !== u))}
            className="absolute -top-1.5 -right-1.5 rounded-full bg-fg p-0.5 text-white shadow hover:bg-bad"><X className="size-3" /></button>
        </span>
      ))}
      {value.length + busy < max && (
        <button type="button" aria-label={label} title="Chụp / chọn ảnh lỗi" onClick={() => ref.current?.click()} disabled={busy > 0}
          className="flex size-11 items-center justify-center rounded-md border border-dashed border-line-strong text-subtle hover:border-brand hover:text-brand disabled:opacity-60">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
        </button>
      )}
      {busy > 0 && value.length + busy >= max && <Loader2 className="size-4 animate-spin text-subtle" />}
      <input ref={ref} type="file" accept="image/*" multiple className="sr-only" onChange={e => { pick(e.target.files); e.target.value = ""; }} />
    </div>
  );
}
