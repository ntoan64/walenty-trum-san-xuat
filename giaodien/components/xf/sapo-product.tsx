"use client";

import { ImageOff } from "lucide-react";
import { priceRange, sapoStock, type Product } from "@core";
import { nf, vnd } from "@/lib/format";
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

// Bảng phiên bản như trang sản phẩm Sapo: ảnh, size/màu, SKU, tồn từng chi nhánh, đủ các bảng giá
export function SapoVariants({ p }: { p: Product }) {
  const vs = p.variants ?? [];
  if (!vs.length) return null;
  const branches = [...new Set(vs.flatMap(v => Object.keys(v.stocks ?? {})))].sort();
  const lists = [...new Set(vs.flatMap(v => Object.keys(v.prices ?? {})))];
  const total = sapoStock(p);
  return (
    <div className="reveal min-w-0 rounded-xl border border-line bg-surface shadow-[0_4px_16px_rgba(31,27,26,0.05)]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-3">
        <h3 className="font-serif text-[15px] font-semibold text-brand">Phiên bản Sapo</h3>
        <span className="text-xs text-muted-foreground">
          {vs.length} phiên bản · tồn <b className="num text-fg">{nf(total)}</b>
          {p.category && <> · Loại <b className="text-fg">{p.category}</b></>}
          {p.brand && <> · Nhãn hiệu <b className="text-fg">{p.brand}</b></>}
        </span>
        {!!p.tags?.length && <span className="flex flex-wrap gap-1">{p.tags.map(t => <span key={t} className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted-foreground">{t}</span>)}</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-max min-w-full text-[12.5px]">
          <thead className="bg-surface-low text-left text-[10.5px] tracking-[0.05em] text-muted-foreground uppercase">
            <tr>
              <th className="px-3 py-2">Ảnh</th><th className="px-3 py-2">Phiên bản</th><th className="px-3 py-2">SKU / Barcode</th>
              {branches.map(b => <th key={b} className="px-3 py-2 text-right">Tồn {b}</th>)}
              <th className="px-3 py-2 text-right">Tồn kho</th>
              <th className="px-3 py-2 text-right">Giá bán lẻ</th>
              {lists.map(l => <th key={l} className="px-3 py-2 text-right whitespace-nowrap">{l}</th>)}
              <th className="px-3 py-2 text-right">Giá nhập</th>
            </tr>
          </thead>
          <tbody>
            {vs.map(v => (
              <tr key={v.sku} className="border-t border-line hover:bg-surface-2">
                <td className="px-3 py-1.5"><Thumb src={sapoImg(v.image, "small")} full={v.image} alt={`${p.name} ${v.size}`} size={36} /></td>
                <td className="px-3 py-1.5">
                  <b className="text-brand">{v.size}</b>{v.color && <span className="text-muted-foreground"> · {v.color}</span>}
                </td>
                <td className="num px-3 py-1.5">
                  {v.sku}{v.barcode && v.barcode !== v.sku && <div className="text-[11px] text-subtle">{v.barcode}</div>}
                </td>
                {branches.map(b => <td key={b} className="num px-3 py-1.5 text-right text-muted-foreground">{nf(v.stocks?.[b] ?? 0)}</td>)}
                <td className={cn("num px-3 py-1.5 text-right font-semibold", !(v.stock ?? 0) && "text-subtle")}>{nf(v.stock ?? 0)}</td>
                <td className="num px-3 py-1.5 text-right font-semibold">{v.price != null ? vnd(v.price) : "—"}</td>
                {lists.map(l => <td key={l} className="num px-3 py-1.5 text-right">{v.prices?.[l] != null ? vnd(v.prices[l]) : "—"}</td>)}
                <td className="num px-3 py-1.5 text-right text-brown">{v.cost != null ? vnd(v.cost) : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-line bg-surface-low font-semibold">
            <tr>
              <td colSpan={3} className="px-3 py-2">Tổng</td>
              {branches.map(b => <td key={b} className="num px-3 py-2 text-right">{nf(vs.reduce((t, v) => t + (v.stocks?.[b] ?? 0), 0))}</td>)}
              <td className="num px-3 py-2 text-right">{nf(total)}</td>
              <td className="num px-3 py-2 text-right text-muted-foreground">{fmtRange(priceRange(vs.map(v => v.price)))}</td>
              <td colSpan={lists.length + 1} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
