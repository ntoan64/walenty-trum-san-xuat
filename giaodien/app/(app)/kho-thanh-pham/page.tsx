"use client";

import { useState } from "react";
import { History, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { byId, costOf, sum } from "@core";
import { ProductThumb } from "@/components/xf/sapo-product";
import { matches } from "@/lib/search";
import { SearchBox } from "@/components/xf/search-box";
import { useDraft } from "@/lib/use-draft";
import { useStore } from "@/lib/store";
import { fmtDT, nf, vnd } from "@/lib/format";
import { finishedStock } from "@/lib/selectors";
import { ExportButton } from "@/components/xf/export-button";
import { PageHeader, Panel, StatCard, StatusPill, TableWrap } from "@/components/xf/basics";

export default function FinishedPage() {
  const { data: s } = useStore();
  const stock = finishedStock(s);
  const [search, setSearch] = useDraft("finished:q", "");
  const [limit, setLimit] = useState(30);
  // Mẫu từ Sapo: tồn = tồn Sapo (mọi chi nhánh), giá trị = Σ tồn × giá nhập từng phiên bản.
  // Mẫu tự tạo: tồn = hàng QC pass nhập trên web × giá vốn theo định mức.
  // Cột "Nhập từ SX" luôn là số web tự ghi khi QC pass (để đối chiếu với Sapo).
  const allRows = s.products.map(p => {
    const web = stock[p.id] ?? 0, c = costOf(p, s.materials);
    return { p, web, c, q: web, v: web * c };
  }).sort((a, b) => b.q - a.q);
  const totalQ = sum(allRows, r => r.q);
  const totalV = sum(allRows, r => r.v);
  const totalWeb = sum(allRows, r => r.web);
  const rows = allRows.filter(r => matches(search, r.p.sku, r.p.name, r.p.category, r.p.variants?.map(v => `${v.sku} ${v.barcode ?? ""}`).join(" ")));
  const hist = s.finishedTxns
    .filter(h => { const p = s.products.find(x => x.id === h.product); return matches(search, p?.sku, p?.name, h.order, h.repair); })
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <>
      <PageHeader
        eyebrow={<>Phân hệ kho <span className="text-subtle">/</span> <span className="text-subtle">Thành phẩm</span></>}
        title="Kho thành phẩm"
        desc="Chỉ hàng QC pass mới được nhập vào đây. Kho nhận tin mỗi khi có hàng mới."
        aside={
          <div className="grid w-full grid-cols-2 gap-2 min-[1500px]:w-auto">
            <StatCard className="min-[1500px]:min-w-[130px]" label="Tồn" value={nf(totalQ)} unit="cái" tone="brand" />
            <StatCard className="min-[1500px]:min-w-[150px]" label="Giá trị tồn" value={<span className="text-[20px]">{vnd(totalV)}</span>} tone="brown" />
          </div>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SearchBox value={search} onChange={v => { setSearch(v); setLimit(30); }} placeholder="Tìm tên, SKU, barcode, mã lệnh…" label="Tìm thành phẩm" className="sm:w-80" />
        <ExportButton name="kho-thanh-pham" build={() => [
          { name: "Tồn thành phẩm",
            columns: [{ header: "Mã mẫu", key: "sku" }, { header: "Sản phẩm", key: "name", width: 28 }, { header: "Loại", key: "cat", width: 14 }, { header: "Phiên bản (size:SKU:tồn)", key: "variants", width: 40 }, { header: "Tồn", key: "q", fmt: "int" }, { header: "Nhập từ SX (web)", key: "web", fmt: "int" }, { header: "Giá vốn / cái", key: "c", fmt: "money" }, { header: "Giá trị tồn", key: "v", fmt: "money" }],
            rows: allRows.map(r => ({ sku: r.p.sku, name: r.p.name, cat: r.p.category, variants: r.p.variants?.map(v => `${v.size}${v.color ? `/${v.color}` : ""}:${v.sku}:${v.stock ?? 0}`).join(" "), q: r.q, web: r.web, c: r.c, v: r.v })) },
          { name: "Lịch sử nhập",
            columns: [{ header: "Ngày giờ", key: "at", fmt: "datetime", width: 18 }, { header: "SKU", key: "sku" }, { header: "Sản phẩm", key: "name", width: 28 }, { header: "Lệnh", key: "order" }, { header: "Số lượng", key: "qty", fmt: "int" }, { header: "Nguồn", key: "src", width: 22 }, { header: "Người làm", key: "by" }],
            rows: s.finishedTxns.slice().sort((a, b) => b.at.getTime() - a.at.getTime()).map(h => { const p = byId(s.products, h.product); return { at: h.at, sku: p?.sku, name: p?.name, order: h.order, qty: h.qty, src: h.note ?? (h.repair ? `Sau sửa ${h.repair}` : "QC đợt nhận"), by: h.by }; }) },
        ]} />
      </div>
      <Panel title="Tồn theo sản phẩm" icon={PackageCheck} flush>
        <TableWrap>
          <table className="wl-table">
            <thead><tr><th className="w-12">Ảnh</th><th>Sản phẩm</th><th>Loại</th><th className="r">Tồn</th><th className="r">Nhập từ SX</th><th className="r">Giá vốn / cái</th><th className="r">Giá trị tồn</th></tr></thead>
            <tbody>
              {rows.slice(0, limit).map(r => (
                <tr key={r.p.id}>
                  <td className="!py-1.5"><ProductThumb p={r.p} size={36} /></td>
                  <td>
                    <div className="font-serif font-medium">{r.p.name}</div>
                    <div className="num text-[11.5px] text-subtle">{r.p.variants?.[0]?.sku ?? r.p.sku}{r.p.variants && r.p.variants.length > 1 && ` · ${r.p.variants.length} phiên bản`}</div>
                  </td>
                  <td className="text-[12.5px] whitespace-nowrap">{r.p.category ?? ""}</td>
                  <td className={`r num font-semibold ${r.q ? "" : "text-subtle"}`}>{nf(r.q)}</td>
                  <td className="r num text-ok">{r.web ? `+${nf(r.web)}` : <span className="text-subtle">—</span>}</td>
                  <td className="r num">{vnd(r.c)}</td>
                  <td className="r num">{vnd(r.v)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={3}>Tổng</td><td className="r num">{nf(totalQ)}</td><td className="r num">{totalWeb ? `+${nf(totalWeb)}` : ""}</td><td /><td className="r num">{vnd(totalV)}</td></tr></tfoot>
          </table>
        </TableWrap>
        {rows.length > limit && (
          <div className="flex justify-center border-t border-line p-3">
            <Button variant="secondary" size="sm" onClick={() => setLimit(limit + 30)}>Xem thêm {Math.min(30, rows.length - limit)} sản phẩm</Button>
          </div>
        )}
      </Panel>
      <Panel title="Lịch sử nhập kho thành phẩm" icon={History} flush>
        <TableWrap>
          <table className="wl-table">
            <thead><tr><th>Ngày</th><th>Sản phẩm</th><th>Lệnh</th><th className="r">Số lượng</th><th>Nguồn</th></tr></thead>
            <tbody>
              {hist.map(h => (
                <tr key={h.id}>
                  <td className="num">{fmtDT(h.at)}</td>
                  <td>{byId(s.products, h.product)?.name}</td>
                  <td className="num">{h.order}</td>
                  <td className={`r num font-semibold ${h.qty < 0 ? "text-bad" : "text-ok"}`}>{h.qty > 0 ? "+" : ""}{nf(h.qty)}</td>
                  <td>{h.note ? <StatusPill tone="bad">{h.note}</StatusPill> : h.repair ? <StatusPill tone="warn">Sau sửa · {h.repair}</StatusPill> : <StatusPill tone="ok">QC đợt nhận</StatusPill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Panel>
    </>
  );
}
