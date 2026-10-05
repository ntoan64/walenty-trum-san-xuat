"use client";

import { Factory, Layers, Send, Wrench } from "lucide-react";
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
import { ExportButton } from "@/components/xf/export-button";
import { byId } from "@core";
import { cn } from "@/lib/utils";

export default function ReportsPage() {
  const { data: s, can } = useStore();
  const act = useConfirmAction();
  const [period, setPeriod] = useDraft<Period>("report:period", "week");
  const now = new Date();
  const st = periodStart(period, now);
  const cancelled = new Set(s.orders.filter(o => o.cancelled).map(o => o.id));
  const evs = inRange(s.events, st).filter(e => !cancelled.has(e.order)); // bỏ lệnh đã hủy
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
            <ExportButton name={`bao-cao-${period === "day" ? "hom-nay" : "7-ngay"}`} build={() => {
              const STEP: Record<string, string> = { cut: "Chờ cắt", sew: "Đang may", qc: "QC", done: "Hoàn thành" };
              return [
                { name: "Tổng hợp", note: `Kỳ: ${period === "day" ? `hôm nay ${fmtD(now)}` : `${fmtD(st)} – ${fmtD(now)}`}`,
                  columns: [{ header: "Chỉ số", key: "k", width: 26 }, { header: "Số lượng", key: "v", fmt: "int" }],
                  rows: [["Gửi may", a.issue], ["Nhận về", a.receive], ["QC pass", a.pass], ["QC fail", a.fail], ["Trả về xưởng sửa", a.sua], ["Xưởng trả lại", a.back], ["Hao hụt", a.loss]].map(([k, v]) => ({ k, v })) },
                { name: "Theo xưởng",
                  columns: [{ header: "Xưởng", key: "ws", width: 24 }, { header: "Gửi may", key: "issue", fmt: "int" }, { header: "Nhận về", key: "receive", fmt: "int" }, { header: "Pass", key: "pass", fmt: "int" }, { header: "Fail", key: "fail", fmt: "int" }, { header: "Trả sửa", key: "sua", fmt: "int" }, { header: "Hao hụt", key: "loss", fmt: "int" }, { header: "Pass lần đầu", key: "fpy", fmt: "pct" }],
                  rows: s.workshops.map(w => { const x = aggregate(evs.filter(e => e.workshop === w.id)); return { ws: w.name, ...x, fpy: x.fpy ?? "" }; }) },
                { name: "Lệnh sản xuất",
                  columns: [{ header: "Mã lệnh", key: "code" }, { header: "SKU", key: "sku" }, { header: "Sản phẩm", key: "name", width: 28 }, { header: "Xưởng", key: "ws", width: 20 }, { header: "Theo size", key: "sizes", width: 22 }, { header: "Số lượng", key: "qty", fmt: "int" }, { header: "Bước", key: "step" }, { header: "Ngày tạo", key: "created", fmt: "date" }, { header: "Dự kiến xong", key: "due", fmt: "date" }, { header: "Hao hụt", key: "loss", fmt: "int" }],
                  rows: s.orders.map(o => { const p = byId(s.products, o.product); return { code: o.code, sku: p?.sku, name: p?.name, ws: wsName(s, o.workshop), sizes: o.sizes?.map(z => `${z.size}:${z.qty}`).join(" "), qty: o.qty, step: o.cancelled ? "Đã hủy" : STEP[o.step], created: o.createdAt, due: o.dueAt, loss: o.loss }; }) },
                { name: "Phiếu sửa đang mở",
                  columns: [{ header: "Phiếu", key: "code" }, { header: "Lệnh", key: "order" }, { header: "Xưởng", key: "ws", width: 20 }, { header: "SL", key: "qty", fmt: "int" }, { header: "Lỗi", key: "defect", width: 36 }, { header: "Gửi", key: "sent", fmt: "date" }, { header: "Hạn", key: "due", fmt: "date" }],
                  rows: open.map(r => ({ code: r.code, order: byId(s.orders, r.order)?.code, ws: wsName(s, r.workshop), qty: r.qty, defect: r.items?.length ? r.items.map(i => `${i.size} ${i.defect} ×${i.qty}`).join("; ") : r.defect, sent: r.sentAt, due: r.dueAt })) },
                { name: "Phụ liệu sắp hết",
                  columns: [{ header: "Mã", key: "code" }, { header: "Tên", key: "name", width: 26 }, { header: "Tồn", key: "stock", fmt: "dec" }, { header: "ĐVT", key: "unit" }, { header: "Báo hết dưới", key: "min", fmt: "dec" }],
                  rows: low.map(m => ({ code: m.code, name: m.name, stock: m.stock, unit: m.unit, min: m.minStock })) },
              ];
            }} />
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
