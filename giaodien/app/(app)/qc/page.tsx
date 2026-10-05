"use client";

import { History, PackageSearch, Wrench } from "lucide-react";
import { isRepairLate } from "@core";
import { matches } from "@/lib/search";
import { SearchBox } from "@/components/xf/search-box";
import { useDraft } from "@/lib/use-draft";
import { useStore } from "@/lib/store";
import { fmtDT } from "@/lib/format";
import { prodOf, wsName } from "@/lib/actions";
import { lateRepairs, pendingBatches } from "@/lib/selectors";
import { AlertRow, EmptyState, PageHeader, Panel, StatCard } from "@/components/xf/basics";
import { RepairTable } from "@/components/xf/repair-table";

export default function QCPage() {
  const { data: s } = useStore();
  const now = new Date();
  const [q, setQ] = useDraft("qc:q", "");
  // tìm theo mã lệnh / phiếu, sản phẩm, xưởng, lỗi, size
  const hit = (orderId: string, ...more: unknown[]) => {
    const o = s.orders.find(x => x.id === orderId);
    const p = o && s.products.find(x => x.id === o.product);
    return matches(q, o?.code, p?.name, p?.sku, ...more);
  };
  const pend = pendingBatches(s).filter(({ o }) => hit(o.id, wsName(s, o.workshop)));
  const repHit = (r: (typeof s.repairs)[number]) => hit(r.order, r.code, r.defect, wsName(s, r.workshop), r.items?.map(i => `${i.size} ${i.defect}`).join(" "));
  const open = s.repairs
    .filter(r => r.status !== "closed" && repHit(r))
    .sort((a, b) => Number(isRepairLate(b, now)) - Number(isRepairLate(a, now)));
  const closed = s.repairs.filter(r => r.status === "closed" && repHit(r)).reverse();
  const late = lateRepairs(s, now).length;

  return (
    <>
      <PageHeader
        eyebrow={<>Kiểm soát chất lượng <span className="text-subtle">/</span> <span className="text-subtle">QC & trả sửa</span></>}
        title="QC & trả sửa"
        desc="Mọi hàng trả về xưởng đều có phiếu và lịch sử, quá hạn sẽ báo Telegram."
        aside={
          <div className="grid w-full grid-cols-3 gap-2 min-[1500px]:w-auto">
            <StatCard className="min-[1500px]:min-w-[120px]" label="Chờ QC" value={pend.length} unit="đợt" tone="brand" />
            <StatCard className="min-[1500px]:min-w-[120px]" label="Phiếu mở" value={open.length} unit="phiếu" />
            <StatCard className="min-[1500px]:min-w-[120px]" label="Quá hạn" value={late} unit="phiếu" tone={late ? "alert" : "default"} />
          </div>
        }
      />
      <SearchBox value={q} onChange={setQ} placeholder="Tìm mã lệnh, phiếu sửa, sản phẩm, lỗi…" label="Tìm trong QC" className="sm:w-80" />
      <Panel title={`Hàng chờ QC (${pend.length})`} icon={PackageSearch}>
        {pend.length ? (
          <div className="flex flex-col gap-2">
            {pend.map(({ o, b }) => (
              <AlertRow key={b.id} tone="info" cta="QC ngay" href={`/lenh-san-xuat/${o.id}`}
                title={`${o.code} · ${b.received} cái ${prodOf(s, o).name}`}
                sub={`${wsName(s, o.workshop)} trả lúc ${fmtDT(b.receivedAt)}`} />
            ))}
          </div>
        ) : <EmptyState>Không có hàng chờ QC. Khi xưởng trả hàng, đợt nhận sẽ hiện ở đây.</EmptyState>}
      </Panel>
      <Panel title={`Phiếu trả sửa đang mở (${open.length})`} icon={Wrench} flush
        hint={<>Trạng thái: <i>Đã gửi xưởng → Xưởng đã nhận → Xưởng trả lại → QC lại</i>.</>}>
        <RepairTable list={open} empty="Không còn phiếu sửa nào đang mở." />
      </Panel>
      <Panel title={`Lịch sử phiếu đã xong (${closed.length})`} icon={History} flush>
        <RepairTable list={closed} empty="Chưa có phiếu nào hoàn tất." />
      </Panel>
    </>
  );
}
