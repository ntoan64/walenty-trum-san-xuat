"use client";

import { Fragment, useState } from "react";
import { byId, isRepairLate, validateRequc, type RepairTicket } from "@core";
import { Button } from "@/components/ui/button";
import { fmtD, fmtDT } from "@/lib/format";
import { useStore, A } from "@/lib/store";
import { useAction, useConfirmAction } from "@/lib/use-action";
import { Summary } from "./confirm-provider";
import { wsName } from "@/lib/actions";
import { useDraft } from "@/lib/use-draft";
import { EmptyState, NumberField, StatusPill, TableWrap } from "./basics";
import { PhotoStrip } from "@/components/xf/photos";

function RepairStatus({ r, now }: { r: RepairTicket; now: Date }) {
  if (r.status === "closed") return <StatusPill tone="ok" dot>Đã xong</StatusPill>;
  if (r.status === "returned") return <StatusPill tone="info" dot>Chờ QC lại</StatusPill>;
  const label = r.status === "sent" ? "Đã gửi xưởng" : "Xưởng đang sửa";
  return isRepairLate(r, now)
    ? <StatusPill tone="bad" dot>{label} · quá hạn</StatusPill>
    : <StatusPill tone="warn" dot>{label}</StatusPill>;
}

function RequcForm({ r }: { r: RepairTicket }) {
  const act = useConfirmAction();
  const notify = useAction();
  const [v, setV] = useDraft(`requc:${r.id}`, { pass: String(r.qty), again: "0", hong: "0" });
  const [err, setErr] = useState<string | null>(null);
  const submit = () => {
    const q = { pass: +v.pass || 0, again: +v.again || 0, hong: +v.hong || 0 };
    const e = validateRequc(r.qty, q);
    if (e) { setErr(e); notify(null, () => ({ ok: false, error: e })); return; }
    setErr(null);
    act(
      { title: `QC lại phiếu ${r.code}?`, confirmLabel: "Lưu QC lại",
        description: (
          <>
            <Summary rows={[["Phiếu", `${r.code} · ${r.qty} cái`], ["Pass (nhập kho)", `${q.pass} cái`], ["Sửa tiếp", `${q.again} cái`], ["Hỏng", `${q.hong} cái`]]} />
            {q.again > 0 && <p className="mt-2 text-xs">Sẽ tạo phiếu mới vòng {r.round + 1} cho {q.again} cái sửa tiếp.</p>}
          </>
        ) },
      "repair.requc", A.requc, r.id, q,
    );
  };
  return (
    <div className="min-w-[300px]">
      <div className="grid grid-cols-[repeat(3,minmax(64px,1fr))_auto] items-end gap-1.5">
        <NumberField id={`rp-${r.id}`} label="Pass" value={v.pass} onChange={x => setV({ ...v, pass: x })} />
        <NumberField id={`ra-${r.id}`} label="Sửa tiếp" value={v.again} onChange={x => setV({ ...v, again: x })} />
        <NumberField id={`rh-${r.id}`} label="Hỏng" value={v.hong} onChange={x => setV({ ...v, hong: x })} />
        <Button size="sm" onClick={submit}>QC lại</Button>
      </div>
      {err && <p className="mt-1 text-xs text-bad">{err}</p>}
    </div>
  );
}

function RepairAction({ r }: { r: RepairTicket }) {
  const { can, data } = useStore();
  const act = useConfirmAction();
  const ws = wsName(data, r.workshop);
  if (r.status === "closed" && r.requc) {
    const q = r.requc;
    return (
      <span className="text-xs text-muted-foreground">
        QC lại {fmtD(q.at)}: {q.pass} pass{q.hong ? `, ${q.hong} hỏng` : ""}{q.again ? `, ${q.again} sửa tiếp` : ""}
      </span>
    );
  }
  if (r.status === "returned") {
    return can("repair.requc") ? <RequcForm r={r} /> : <span className="text-xs text-muted-foreground">Chờ QC kiểm lại</span>;
  }
  if (!can("repair.status")) return <span className="text-xs text-muted-foreground">Chỉ xem</span>;
  if (r.status === "sent") return <Button size="sm" variant="secondary" onClick={() => act({ title: `${ws} đã nhận phiếu ${r.code}?`, confirmLabel: "Xác nhận", description: <Summary rows={[["Phiếu", r.code], ["Số lượng", `${r.qty} cái`], ["Hạn trả", fmtD(r.dueAt)]]} /> }, "repair.status", A.repairStatus, r.id, "received")}>Xưởng đã nhận</Button>;
  return <Button size="sm" variant="secondary" onClick={() => act({ title: `${ws} đã trả lại hàng sửa?`, confirmLabel: "Xác nhận", description: <Summary rows={[["Phiếu", r.code], ["Số lượng", `${r.qty} cái`], ["Tiếp theo", "Team QC kiểm lại"]]} /> }, "repair.status", A.repairStatus, r.id, "returned")}>Xưởng trả lại</Button>;
}

export function RepairTable({ list, empty = "Không có phiếu trả sửa." }: { list: RepairTicket[]; empty?: string }) {
  const { data } = useStore();
  const now = new Date();
  if (!list.length) return <EmptyState>{empty}</EmptyState>;
  return (
    <TableWrap>
      <table className="wl-table !min-w-[1000px]">
        <thead>
          <tr>
            <th>Phiếu</th><th>Lệnh</th><th>Xưởng</th><th className="r">SL</th><th>Lỗi</th><th>Gửi → hạn</th><th>Trạng thái</th><th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {list.map(r => (
            <Fragment key={r.id}>
              <tr>
                <td className="whitespace-nowrap">
                  <span className="num font-bold text-brand">{r.code}</span>
                  {r.round > 1 && <StatusPill tone="muted" className="ml-1.5">vòng {r.round}</StatusPill>}
                </td>
                <td className="num whitespace-nowrap">{byId(data.orders, r.order)?.code}</td>
                <td className="whitespace-nowrap">{wsName(data, r.workshop)}</td>
                <td className="r num">{r.qty}</td>
                <td className="text-[13px]">{r.items?.length ? r.items.map((x, k) => <div key={k} className="whitespace-nowrap"><b>{x.size}</b> · {x.defect} ×{x.qty} <PhotoStrip photos={x.photos} size={28} className="ml-1" /></div>) : <>{r.defect} <PhotoStrip photos={r.photos} size={28} className="ml-1" /></>}</td>
                <td className="num whitespace-nowrap">{fmtD(r.sentAt)} → {fmtD(r.dueAt)}</td>
                <td><RepairStatus r={r} now={now} /></td>
                <td><RepairAction r={r} /></td>
              </tr>
              <tr className="hover:!bg-transparent">
                <td />
                <td colSpan={7} className="!pt-0">
                  <ol className="flex flex-col gap-0.5 text-[12.5px]">
                    {r.history.map((h, i) => (
                      <li key={i}>
                        <time className="num mr-2 text-[11.5px] text-subtle">{fmtDT(h.at)}</time>
                        {h.text} <span className="text-subtle">· {h.by}</span>
                      </li>
                    ))}
                  </ol>
                </td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}
