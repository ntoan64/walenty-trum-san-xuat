import Link from "next/link";
import { isOrderLate, isRepairLate, type ProductionOrder } from "@core";
import { cn } from "@/lib/utils";
import { fmtD, nf } from "@/lib/format";
import type { DataState } from "@core/state";
import { prodOf, repairsOf, wsName } from "@/lib/actions";
import { balanceOf, issuedFor } from "@/lib/selectors";
import { BalanceBar } from "./balance";
import { StatusPill } from "./basics";

export function OrderChips({ s, o, now }: { s: DataState; o: ProductionOrder; now: Date }) {
  const b = balanceOf(s, o);
  const repLate = repairsOf(s, o).some(r => isRepairLate(r, now));
  return (
    <>
      {b.pendingQC > 0 && <StatusPill tone="info">{b.pendingQC} chờ QC</StatusPill>}
      {b.inRepair > 0 && <StatusPill tone={repLate ? "bad" : "warn"}>{b.inRepair} đang sửa{repLate ? ", quá hạn" : ""}</StatusPill>}
      {o.loss > 0 && !o.lossApproved && <StatusPill tone="warn">Hao hụt chờ duyệt</StatusPill>}
      {isOrderLate(o, now) && <StatusPill tone="bad">Trễ hạn</StatusPill>}
    </>
  );
}

export function OrderCard({ s, o, now }: { s: DataState; o: ProductionOrder; now: Date }) {
  const b = balanceOf(s, o);
  const late = isOrderLate(o, now) || repairsOf(s, o).some(r => isRepairLate(r, now));
  return (
    <Link
      href={`/lenh-san-xuat/${o.id}`}
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border bg-surface p-3 shadow-[0_1px_4px_rgba(0,0,0,0.03)] transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:shadow-[0_6px_16px_rgba(94,17,23,0.10)] active:translate-y-0 active:scale-[0.99]",
        late ? "border-bad" : "border-transparent",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="num text-[12px] font-bold text-brand">{o.code}</span>
        {o.cancelled ? <StatusPill tone="bad">Đã hủy</StatusPill> : <StatusPill tone="muted">Hạn {fmtD(o.dueAt)}</StatusPill>}
      </div>
      <div className="font-serif leading-snug font-semibold">{prodOf(s, o).name}</div>
      <div className="text-xs text-muted-foreground">
        {wsName(s, o.workshop)} · <span className="num">{o.qty}</span> cái
      </div>
      {o.step !== "cut" && <BalanceBar qty={o.qty} b={b} />}
      {o.step === "cut" && (() => {
        const prep = issuedFor(s, o);
        return prep.length ? (
          <div className="rounded-md bg-surface-2 px-2 py-1.5 text-[11.5px] leading-relaxed">
            <span className="font-semibold text-brown">Cần chuẩn bị: </span>
            {prep.map(x => `${x.material!.code} ${nf(x.qty, 1)} ${x.material!.unit}`).join(" · ")}
          </div>
        ) : null;
      })()}
      {o.sizes?.length ? (
        <div className="flex flex-wrap gap-1 text-[11px] text-muted-foreground">
          {o.sizes.map(z => <span key={z.size} className="num rounded bg-surface-2 px-1.5"><b className="text-brand">{z.size}</b> {z.qty}</span>)}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-1">
        <OrderChips s={s} o={o} now={now} />
      </div>
    </Link>
  );
}
