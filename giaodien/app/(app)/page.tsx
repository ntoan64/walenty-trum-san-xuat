"use client";

import { AlertTriangle, ListChecks, Workflow } from "lucide-react";
import { canView, sum, type Screen } from "@core";
import { useStore } from "@/lib/store";
import { fmtD, fmtWeekday, nf } from "@/lib/format";
import { prodOf, wsName } from "@/lib/actions";
import { balanceOf, lateRepairs, lowMaterials, openRepairs, totalFinished } from "@/lib/selectors";
import { AlertRow, EmptyState, PageHeader, Panel, StatCard } from "@/components/xf/basics";
import { cn } from "@/lib/utils";

const FLOW = [
  ["KHO", "Xuất phụ liệu", "Theo định mức, giá bình quân"],
  ["1", "Chờ cắt", "Xưởng nào đang đợi cắt"],
  ["2", "Nhận may", "Cắt xưởng nào, may xưởng đó"],
  ["3", "QC", "Pass nhập kho, fail trả xưởng sửa"],
  ["4", "Hoàn thành", "Chỉ đóng khi cân đủ số lượng"],
];

export default function OverviewPage() {
  const { data: s, role } = useStore();
  const now = new Date();
  const open = s.orders.filter(o => o.step !== "done");
  const bs = open.map(o => ({ o, b: balanceOf(s, o) }));
  const atWs = sum(bs, x => x.b.notReturned + x.b.inRepair);
  const pq = sum(bs, x => x.b.pendingQC);
  const lateR = lateRepairs(s, now);

  type Row = { tone: "bad" | "warn" | "info"; title: string; sub: string; href: string; screen: Screen };
  const rows: Row[] = [
    ...lateR.map(r => ({ tone: "bad" as const, title: `Phiếu sửa ${r.code} quá hạn`, sub: `${wsName(s, r.workshop)} đang giữ ${r.qty} cái · lỗi ${r.defect} · hạn ${fmtD(r.dueAt)}`, href: `/lenh-san-xuat/${r.order}`, screen: "orders" as const })),
    ...s.repairs.filter(r => r.status === "returned").map(r => ({ tone: "info" as const, title: `${r.code}: xưởng đã trả lại, chờ QC lại`, sub: `${r.qty} cái · ${wsName(s, r.workshop)}`, href: "/qc", screen: "qc" as const })),
    ...bs.filter(x => x.b.pendingQC).map(({ o, b }) => ({ tone: "info" as const, title: `${o.code}: ${b.pendingQC} cái chờ QC`, sub: `${prodOf(s, o).name} · ${wsName(s, o.workshop)}`, href: `/lenh-san-xuat/${o.id}`, screen: "orders" as const })),
    ...open.filter(o => o.loss && !o.lossApproved).map(o => ({ tone: "warn" as const, title: `${o.code}: hao hụt ${o.loss} cái chờ duyệt`, sub: `${wsName(s, o.workshop)} · ${((o.loss / o.qty) * 100).toFixed(1).replace(".", ",")}% (cho phép 2%)`, href: `/lenh-san-xuat/${o.id}`, screen: "orders" as const })),
    ...(s.customerRepairs ?? []).filter(r => r.status !== "done" && r.promisedAt < now).map(r => ({ tone: "bad" as const, title: `Đồ khách ${r.code} trễ hẹn trả`, sub: `${r.customerName} · ${r.item} · hẹn ${fmtD(r.promisedAt)}`, href: "/sua-cho-khach", screen: "customer" as const })),
    ...(s.customerRepairs ?? []).filter(r => r.status === "returned").map(r => ({ tone: "info" as const, title: `${r.code}: sửa xong, chờ trả khách`, sub: `${r.customerName} · ${r.customerPhone}`, href: "/sua-cho-khach", screen: "customer" as const })),
    ...lowMaterials(s).map(m => ({ tone: "bad" as const, title: `${m.code} sắp hết`, sub: `${m.name}: còn ${nf(m.stock, 1)} ${m.unit}, báo hết dưới ${nf(m.minStock)}`, href: "/kho-phu-lieu", screen: "materials" as const })),
  ];

  return (
    <>
      <PageHeader
        eyebrow={<>Phân hệ điều phối <span className="text-subtle">/</span> <span className="text-subtle">Tổng quan</span></>}
        title="Tổng quan xưởng"
        desc={<span className="first-letter:uppercase">{fmtWeekday(now)}</span>}
        aside={
          <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4 min-[1500px]:w-auto">
            <StatCard className="min-[1500px]:min-w-[130px]" label="Hàng ở xưởng" value={atWs} unit="cái" sub="chưa trả + đang sửa" tone="brand" />
            <StatCard className="min-[1500px]:min-w-[130px]" label="Chờ QC" value={pq} unit="cái" sub={`${open.length} lệnh đang chạy`} />
            <StatCard className="min-[1500px]:min-w-[130px]" label="Sửa quá hạn" value={lateR.length} unit="phiếu" sub={`${openRepairs(s).length} phiếu đang mở`} tone={lateR.length ? "alert" : "default"} icon={lateR.length ? AlertTriangle : undefined} />
            <StatCard className="min-[1500px]:min-w-[130px]" label="Thành phẩm" value={nf(totalFinished(s))} unit="cái" sub="đã QC pass" tone="brown" />
          </div>
        }
      />

      <Panel title="Luồng công việc" icon={Workflow}>
        <ol className="grid grid-cols-1 gap-1.5 md:grid-cols-5 md:gap-0">
          {FLOW.map(([n, t, d], i) => (
            <li
              key={t}
              className={cn(
                "rounded-lg px-3.5 py-3 md:rounded-none md:first:rounded-l-lg md:last:rounded-r-lg",
                i === 3 ? "bg-brand text-brand-fg" : "bg-surface-2",
              )}
            >
              <div className={cn("num text-[11px] font-bold", i === 3 ? "text-brand-fg/80" : "text-brand")}>{n}</div>
              <b className="my-0.5 block">{t}</b>
              <span className={cn("text-xs", i === 3 ? "text-brand-fg/80" : "text-muted-foreground")}>{d}</span>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel title={`Cần xử lý (${rows.length})`} icon={ListChecks}>
        {rows.length ? (
          <div className="flex flex-col gap-2">
            {rows.map((r, i) => (
              <AlertRow key={i} tone={r.tone} title={r.title} sub={r.sub} href={canView(role, r.screen) ? r.href : undefined} />
            ))}
          </div>
        ) : (
          <EmptyState>Không có gì cần xử lý.</EmptyState>
        )}
      </Panel>
    </>
  );
}
