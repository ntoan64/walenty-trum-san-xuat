"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { type Product, type ProductVariant } from "@core";
import { useStore, A } from "@/lib/store";
import { useAction } from "@/lib/use-action";
import { vnd } from "@/lib/format";
import { cn } from "@/lib/utils";

// Ảnh Sapo có sẵn bản thu nhỏ: thumb (~3KB), small (~8KB), compact (~18KB), medium (~37KB)
export function sapoImg(url: string | undefined, size: "thumb" | "small" | "compact" | "medium" = "small") {
  if (!url) return undefined;
  return url.replace(/^https:\/\/sapo\.dktcdn\.net\/(?!thumb\/)/, `https://sapo.dktcdn.net/thumb/${size}/`);
}

export const productImage = (p: Product) => p.variants?.find(v => v.image)?.image;

export function Thumb({ src, alt, size = 40, full, className }: { src?: string; alt: string; size?: number; full?: string; className?: string }) {
  const box = { width: size, height: size };
  if (!src) return <span style={box} className={cn("grid shrink-0 place-items-center rounded-md bg-surface-2 text-subtle", className)}><ImageOff className="size-4" /></span>;
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} width={size} height={size} loading="lazy" decoding="async" style={box}
      className={cn("block shrink-0 rounded-md bg-surface-2 object-cover ring-1 ring-line", className)} />
  );
  return full ? <a href={full} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} title="Xem ảnh lớn">{img}</a> : img;
}

export function ProductThumb({ p, size = 40 }: { p: Product; size?: number }) {
  const u = productImage(p);
  return <Thumb src={sapoImg(u, size > 48 ? "compact" : "small")} full={u} alt={p.name} size={size} />;
}

export const fmtRange = (r: [number, number] | null) => (!r ? "—" : r[0] === r[1] ? vnd(r[0]) : `${vnd(r[0])} – ${vnd(r[1])}`);

// 1 dòng phiên bản: giá bán lẻ + giá nhập hiện tại, sửa được
function VariantRow({ p, v, manage }: { p: Product; v: ProductVariant; manage: boolean }) {
  const act = useAction();
  const [f, setF] = useState({ price: String(v.price ?? ""), cost: String(v.cost ?? "") });
  const [busy, setBusy] = useState(false);
  const dirty = (+f.price || 0) !== (v.price ?? 0) || (+f.cost || 0) !== (v.cost ?? 0);
  const save = async () => {
    setBusy(true);
    await act("product.manage", A.setVariantPrice, p.id, v.sku, { price: +f.price || 0, cost: +f.cost || 0 });
    setBusy(false);
  };
  const input = "field-input num !min-h-8 !w-32 !py-1 text-right";
  return (
    <tr className="border-t border-line hover:bg-surface-2">
      <td className="px-3 py-1.5"><b className="text-brand">{v.size}</b>{v.color && <span className="text-muted-foreground"> · {v.color}</span>}</td>
      <td className="num px-3 py-1.5">{v.sku}{v.barcode && v.barcode !== v.sku && <div className="text-[11px] text-subtle">{v.barcode}</div>}</td>
      <td className="px-3 py-1.5 text-right">
        {manage ? <input aria-label={`Giá bán lẻ ${v.sku}`} type="number" min={0} step="any" className={input} value={f.price} onChange={e => setF({ ...f, price: e.target.value })} />
          : <span className="num">{v.price != null ? vnd(v.price) : "—"}</span>}
      </td>
      <td className="px-3 py-1.5 text-right">
        {manage ? <input aria-label={`Giá nhập ${v.sku}`} type="number" min={0} step="any" className={input} value={f.cost} onChange={e => setF({ ...f, cost: e.target.value })} />
          : <span className="num">{v.cost != null ? vnd(v.cost) : "—"}</span>}
      </td>
      {manage && (
        <td className="px-3 py-1.5 text-right">
          <button type="button" disabled={!dirty || busy} onClick={save}
            className={cn("rounded-md px-2.5 py-1 text-xs font-semibold", dirty ? "bg-brand text-brand-fg hover:bg-brand-strong" : "text-subtle")}>
            {dirty ? "Lưu" : "✓"}
          </button>
        </td>
      )}
    </tr>
  );
}

// Bảng phiên bản: size / màu, SKU, giá bán lẻ, giá nhập hiện tại (sửa được)
export function SapoVariants({ p }: { p: Product }) {
  const { can } = useStore();
  const manage = can("product.manage");
  const vs = p.variants ?? [];
  if (!vs.length) return null;
  return (
    <div className="reveal min-w-0 rounded-xl border border-line bg-surface shadow-[0_4px_16px_rgba(31,27,26,0.05)]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-3">
        <h3 className="font-serif text-[15px] font-semibold text-brand">Phiên bản</h3>
        <span className="text-xs text-muted-foreground">
          {vs.length} phiên bản
          {p.category && <> · Loại <b className="text-fg">{p.category}</b></>}
          {p.brand && <> · Nhãn hiệu <b className="text-fg">{p.brand}</b></>}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="bg-surface-low text-left text-[10.5px] tracking-[0.05em] text-muted-foreground uppercase">
            <tr>
              <th className="px-3 py-2">Phiên bản</th><th className="px-3 py-2">SKU / Barcode</th>
              <th className="px-3 py-2 text-right">Giá bán lẻ</th><th className="px-3 py-2 text-right">Giá nhập hiện tại</th>
              {manage && <th className="w-16" />}
            </tr>
          </thead>
          <tbody>
            {vs.map(v => <VariantRow key={v.sku} p={p} v={v} manage={manage} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
