"use client";

import { Factory, FileSpreadsheet, Layers, Send, Wrench } from "lucide-react";
import { aggregate, inRange, isRepairLate } from "@core";
import { Button } from "@/components/ui/button";
import { useStore, A } from "@/lib/store";
import { useConfirmAction } from "@/lib/use-action";
import { daysLate, fmtD, nf, pct } from "@/lib/format";
import { wsName } from "@/lib/actions";
import { lowMaterials, openRepairs } from "@/lib/selectors";
import { periodStart, reportText, type Period } from "@/lib/report-text";
import { AlertRow, EmptyState, PageHeader, Panel, StatCard, TableWrap } from "@/components/xf/basics";
import { useDraft } from "@/lib/use-draft";
import { cn } from "@/lib/utils";

export default function ReportsPage() {
  const { data: s, can } = useStore();
  const act = useConfirmAction();
  const [period, setPeriod] = useDraft<Period>("report:period", "week");
  const now = new Date();
  const st = periodStart(period, now);
  const evs = inRange(s.events, st);
  const a = aggregate(evs);
  const open = openRepairs(s);
  const low = lowMaterials(s);
  const fp = (x: number | null) => (x == null ? "–" : pct(x));

  return (
    <>
      <PageHeader
        eyebrow={<>Phân hệ báo cáo <span className="text-subtle">/</span> <span className="text-subtle">{period === "day" ? "Hôm nay" : "7 ngày"}</span></>}
        title="Báo cáo"
        desc={<>{period === "day" ? `Hôm nay ${fmtD(now)}` : `Từ ${fmtD(st)} đến ${fmtD(now)}`}. Báo cáo ngày tự gửi Telegram lúc 8h sáng, báo cáo tuần gửi sáng thứ Hai.</>}
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Kỳ báo cáo" className="inline-flex rounded-lg bg-surface-3 p-1">
              {(["day", "week"] as const).map(p => (
                <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}
                  className={cn("rounded-md px-3.5 py-1.5 text-[13px] font-semibold",
                    period === p ? "bg-surface text-brand shadow-sm" : "text-muted-foreground hover:text-fg")}>
                  {p === "day" ? "Hôm nay" : "7 ngày"}
                </button>
              ))}
            </div>
            {can("report.send") && (
              <Button onClick={() => act({ title: "Gửi báo cáo vào Telegram?", confirmLabel: "Gửi", description: <pre className="mt-1 rounded-lg bg-surface-2 px-3 py-2.5 font-sans text-[13px] whitespace-pre-wrap text-fg">{reportText(s, period, now)}</pre> }, "report.send", A.sendReport, reportText(s, period, now))}>
                <Send /> Gửi vào Telegram
              </Button>
            )}
            <Button variant="secondary" disabled title="Có ở bản nối dữ liệu thật">
              <FileSpreadsheet /> Xuất Excel
            </Button>
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 min-[1400px]:grid-cols-6">
        <StatCard label="Gửi may" value={nf(a.issue)} unit="cái" tone="brand" />
        <StatCard label="Nhận về" value={nf(a.receive)} unit="cái" />
        <StatCard label="QC pass" value={nf(a.pass)} unit="cái" tone="ok" />
        <StatCard label="QC fail" value={nf(a.fail)} unit="cái" tone={a.fail ? "alert" : "default"} />
        <StatCard label="Trả về xưởng" value={nf(a.sua)} unit="cái" sub={`${a.back} đã trả lại`} tone="brown" />
        <StatCard label="Hao hụt" value={nf(a.loss)} unit="cái" />
      </div>
      <Panel title="Theo xưởng" icon={Factory} flush>
        <TableWrap>
          <table className="wl-table">
            <thead><tr><th>Xưởng</th><th className="r">Gửi may</th><th className="r">Nhận về</th><th className="r">Pass</th><th className="r">Fail</th><th className="r">Trả sửa</th><th className="r">Hao hụt</th><th className="r">Pass lần đầu</th></tr></thead>
            <tbody>
              {s.workshops.map(w => {
                const x = aggregate(evs.filter(e => e.workshop === w.id));
                return (
                  <tr key={w.id}>
                    <td className="font-serif font-medium">{w.name}</td>
                    <td className="r num">{x.issue}</td><td className="r num">{x.receive}</td><td className="r num">{x.pass}</td>
                    <td className="r num">{x.fail}</td><td className="r num">{x.sua}</td><td className="r num">{x.loss}</td>
                    <td className="r num">{fp(x.fpy)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Tổng</td><td className="r num">{a.issue}</td><td className="r num">{a.receive}</td><td className="r num">{a.pass}</td>
                <td className="r num">{a.fail}</td><td className="r num">{a.sua}</td><td className="r num">{a.loss}</td><td className="r num">{fp(a.fpy)}</td>
              </tr>
            </tfoot>
          </table>
        </TableWrap>
      </Panel>
      <div className="grid grid-cols-1 gap-5 min-[1000px]:grid-cols-2">
        <Panel title={`Hàng trả về xưởng chưa xong (${open.length})`} icon={Wrench}>
          {open.length ? (
            <div className="flex flex-col gap-2">
              {open.map(r => {
                const late = isRepairLate(r, now);
                return (
                  <AlertRow key={r.id} tone={late ? "bad" : r.status === "returned" ? "info" : "warn"}
                    title={`${r.code} · ${r.qty} cái · ${wsName(s, r.workshop)}`}
                    sub={`${r.defect} · gửi ${fmtD(r.sentAt)}, hạn ${fmtD(r.dueAt)} · ${r.status === "returned" ? "chờ QC lại" : late ? `trễ ${daysLate(r.dueAt, now)} ngày` : "đang sửa"}`} />
                );
              })}
            </div>
          ) : <EmptyState>Không còn phiếu mở.</EmptyState>}
        </Panel>
        <Panel title={`Phụ liệu sắp hết (${low.length})`} icon={Layers}>
          {low.length ? (
            <div className="flex flex-col gap-2">
              {low.map(m => (
                <AlertRow key={m.id} tone="bad" title={`${m.code} · ${m.name}`} sub={`Còn ${nf(m.stock, 1)} ${m.unit}, báo hết dưới ${nf(m.minStock)}`} />
              ))}
            </div>
          ) : <EmptyState>Phụ liệu đủ dùng.</EmptyState>}
        </Panel>
      </div>
    </>
  );
}
