"use client";

import { History, PackageCheck } from "lucide-react";
import { byId, sum, unitCost } from "@core";
import { matches } from "@/lib/search";
import { SearchBox } from "@/components/xf/search-box";
import { useDraft } from "@/lib/use-draft";
import { useStore } from "@/lib/store";
import { fmtDT, nf, vnd } from "@/lib/format";
import { finishedStock } from "@/lib/selectors";
import { PageHeader, Panel, StatCard, StatusPill, TableWrap } from "@/components/xf/basics";

export default function FinishedPage() {
  const { data: s } = useStore();
  const stock = finishedStock(s);
  const [search, setSearch] = useDraft("finished:q", "");
  const allRows = s.products.map(p => ({ p, q: stock[p.id] ?? 0, c: unitCost(p, s.materials) }));
  const totalQ = sum(allRows, r => r.q);
  const totalV = sum(allRows, r => r.q * r.c);
  const rows = allRows.filter(r => matches(search, r.p.sku, r.p.name));
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
      <SearchBox value={search} onChange={setSearch} placeholder="Tìm SKU, tên sản phẩm, mã lệnh…" label="Tìm thành phẩm" className="sm:w-80" />
      <Panel title="Tồn theo sản phẩm" icon={PackageCheck} flush>
        <TableWrap>
          <table className="wl-table">
            <thead><tr><th>SKU</th><th>Sản phẩm</th><th className="r">Tồn</th><th className="r">Giá vốn hiện tại</th><th className="r">Giá trị tồn</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.p.id}>
                  <td className="num font-bold text-brand">{r.p.sku}</td>
                  <td className="font-serif font-medium">{r.p.name}</td>
                  <td className="r num font-semibold">{nf(r.q)}</td>
                  <td className="r num">{vnd(r.c)}</td>
                  <td className="r num">{vnd(r.q * r.c)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={2}>Tổng</td><td className="r num">{nf(totalQ)}</td><td /><td className="r num">{vnd(totalV)}</td></tr></tfoot>
          </table>
        </TableWrap>
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
