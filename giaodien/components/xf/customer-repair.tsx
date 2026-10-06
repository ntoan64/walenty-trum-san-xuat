"use client";

import { Fragment, useState } from "react";
import { ChevronRight, MessageSquarePlus, Phone } from "lucide-react";
import { byId, type CustomerRepair, type CustomerRepairStatus } from "@core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore, A } from "@/lib/store";
import { useAskAction, useConfirmAction } from "@/lib/use-action";
import { daysLate, fmtD, fmtDT } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useDraft } from "@/lib/use-draft";
import { Summary } from "./confirm-provider";
import { EmptyState, Field, StatusPill, type PillTone } from "./basics";
import { SearchPicker } from "./search-picker";

// Phiếu đồ khách gửi sửa (dùng ở trang Đồ khách gửi sửa và trang QC)
export const STEPS: { key: CustomerRepairStatus; label: string; tone: PillTone }[] = [
  { key: "requested", label: "Sale gửi yêu cầu, chờ QC nhận", tone: "bad" },
  { key: "received", label: "QC đã nhận, chờ gửi xưởng", tone: "warn" },
  { key: "sent", label: "Xưởng đang sửa", tone: "info" },
  { key: "returned", label: "QC đã kiểm, chờ trả sale", tone: "brand" },
  { key: "handed", label: "Cửa hàng đang kiểm tra · chờ nhập SON", tone: "info" },
  { key: "done", label: "Hoàn thành", tone: "ok" },
];
export const stepOf = (k: CustomerRepairStatus) => STEPS.find(s => s.key === k)!;
export const isLate = (r: CustomerRepair, now: Date) => r.status !== "done" && r.promisedAt < now;


function SendDialog({ r, onClose }: { r: CustomerRepair; onClose: () => void }) {
  const { data: s } = useStore();
  const act = useAskAction();
  const list = s.workshops.filter(w => w.active && w.kind !== "ncc");
  const [ws, setWs] = useState(list[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    const res = await act("customer.repair", A.sendCustomerRepair, r.id, ws);
    setBusy(false);
    if (res.ok) onClose();
  };
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg text-brand">Gửi {r.code} cho xưởng</DialogTitle>
          <DialogDescription>{r.item} · khách muốn sửa: {r.request}</DialogDescription>
        </DialogHeader>
        {list.length ? (
          <Field label="Xưởng sửa" htmlFor="cr-ws">
            <SearchPicker id="cr-ws" label="Xưởng sửa" placeholder="Gõ tên xưởng…" value={ws} onPick={setWs}
              items={list.map(w => ({ id: w.id, label: w.name, sub: w.area, search: [w.contactName, ...(w.aliases ?? [])] }))} />
          </Field>
        ) : <p className="text-[13px] text-bad">Chưa có xưởng nào đang hợp tác. Thêm xưởng ở trang Xưởng may.</p>}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button onClick={send} disabled={busy || !ws}>Gửi xưởng</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Ghi chú thêm ---------- */
function NoteDialog({ r, onClose }: { r: CustomerRepair; onClose: () => void }) {
  const act = useAskAction();
  const [text, setText] = useDraft(`customer:note:${r.id}`, "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const res = await act("customer.repair", A.noteCustomerRepair, r.id, text);
    setBusy(false);
    if (res.ok) { setText(""); onClose(); }
  };
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg text-brand">Ghi chú · {r.code}</DialogTitle>
          <DialogDescription>Ghi chú sẽ nằm trong lịch sử phiếu, kèm tên người ghi và giờ.</DialogDescription>
        </DialogHeader>
        <textarea rows={3} maxLength={1000} aria-label="Nội dung ghi chú" className="field-input resize-y" placeholder="VD: Khách gọi đổi sang lên lai 3cm"
          value={text} onChange={e => setText(e.target.value)} />
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button onClick={save} disabled={busy || !text.trim()}>Lưu ghi chú</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RepairCard({ r, now, onSend, onNote }: { r: CustomerRepair; now: Date; onSend: () => void; onNote: () => void }) {
  const { data: s, can } = useStore();
  const act = useConfirmAction();
  const late = isLate(r, now);
  const st = stepOf(r.status);
  const ws = r.workshop ? byId(s.workshops, r.workshop)?.name : undefined;
  const allowed = can("customer.repair");
  const qcOk = can("customer.qc"); // sale chỉ tạo yêu cầu + xác nhận hoàn thành
  return (
    <article className={cn("card flex flex-col gap-2.5 rounded-xl p-4", late && "border-bad")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="num font-bold text-brand">{r.code}</span>
          <StatusPill tone={st.tone} dot>{st.label}</StatusPill>
          {late && <StatusPill tone="bad">Trễ hẹn {daysLate(r.promisedAt, now)} ngày</StatusPill>}
        </div>
        <span className="text-xs text-muted-foreground">Hẹn trả <b className={cn("num", late ? "text-bad" : "text-fg")}>{fmtD(r.promisedAt)}</b></span>
      </div>

      <div className="grid gap-x-4 gap-y-1 text-[13px] sm:grid-cols-2">
        <div><span className="text-muted-foreground">Khách:</span> <b>{r.customerName}</b>{" "}
          <a href={`tel:${r.customerPhone.replace(/\s/g, "")}`} className="num inline-flex items-center gap-0.5 text-brand hover:underline"><Phone className="size-3" />{r.customerPhone}</a>
        </div>
        {r.orderCode && <div><span className="text-muted-foreground">Mã ĐH Sapo:</span> <b className="num">{r.orderCode}</b></div>}
        <div><span className="text-muted-foreground">Sản phẩm:</span> <b className="font-serif">{r.item}</b>{r.size && <StatusPill tone="muted" className="ml-1">{r.size}</StatusPill>}</div>
        {ws && <div><span className="text-muted-foreground">Xưởng:</span> {ws}</div>}
      </div>

      <div className="rounded-lg bg-brand-soft/50 px-3 py-2 text-[13px]">
        <div className="eyebrow mb-0.5 !text-brand">Khách muốn sửa</div>
        <p className="whitespace-pre-line">{r.request}</p>
        {r.note && <p className="mt-1 whitespace-pre-line text-muted-foreground">Ghi chú: {r.note}</p>}
      </div>

      <details className="text-[12.5px]">
        <summary className="cursor-pointer text-muted-foreground hover:text-fg">Lịch sử ({r.history.length})</summary>
        <ol className="mt-1 flex flex-col gap-0.5">
          {r.history.map((h, i) => (
            <li key={i}><time className="num mr-2 text-[11.5px] text-subtle">{fmtDT(h.at)}</time>{h.text} <span className="text-subtle">· {h.by}</span></li>
          ))}
        </ol>
      </details>

      {allowed && r.status !== "done" && (
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button size="sm" variant="secondary" onClick={onNote}><MessageSquarePlus /> Ghi chú</Button>
          {qcOk && r.status === "requested" && (
            <Button size="sm" onClick={() => act(
              { title: `QC nhận ${r.code} từ sale?`, confirmLabel: "Đã nhận hàng", description: <Summary rows={[["Mã ĐH Sapo", r.orderCode ?? "—"], ["Sản phẩm", r.item], ["Khách muốn sửa", r.request]]} /> },
              "customer.repair", A.receiveCustomerRepair, r.id,
            )}>Đã nhận hàng</Button>
          )}
          {qcOk && r.status === "received" && <Button size="sm" onClick={onSend}>Gửi xưởng</Button>}
          {qcOk && r.status === "sent" && (
            <Button size="sm" onClick={() => act(
              { title: `${ws ?? "Xưởng"} đã trả ${r.code}, QC kiểm tra đạt?`, confirmLabel: "Đã nhận về, kiểm tra xong", description: <Summary rows={[["Sản phẩm", r.item], ["Khách muốn sửa", r.request]]} /> },
              "customer.repair", A.customerRepairBack, r.id,
            )}>Xưởng trả về · QC kiểm tra</Button>
          )}
          {qcOk && r.status === "returned" && (
            <Button size="sm" onClick={() => act(
              { title: `Trả ${r.code} cho sale?`, confirmLabel: "Trả sale", description: <Summary rows={[["Khách", `${r.customerName} · ${r.customerPhone}`], ["Sản phẩm", r.item]]} /> },
              "customer.repair", A.customerRepairDone, r.id,
            )}>Trả sale</Button>
          )}
          {r.status === "handed" && <StoreConfirm r={r} />}
        </div>
      )}
    </article>
  );
}


// Cửa hàng nhận lại: tick đã kiểm tra + đã nhập SON rồi mới hoàn thành
function StoreConfirm({ r }: { r: CustomerRepair }) {
  const act = useConfirmAction();
  const [checked, setChecked] = useState(false);
  const [son, setSon] = useState(false);
  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-x-4 gap-y-1.5 rounded-lg bg-surface-low px-3 py-2 text-[12.5px]">
      <label className="flex items-center gap-1.5"><input type="checkbox" className="size-4 accent-[var(--brand)]" checked={checked} onChange={e => setChecked(e.target.checked)} /> Cửa hàng đã kiểm tra đồ</label>
      <label className="flex items-center gap-1.5"><input type="checkbox" className="size-4 accent-[var(--brand)]" checked={son} onChange={e => setSon(e.target.checked)} /> Đã nhập SON <b className="num">{r.orderCode}</b> trên Sapo</label>
      <Button size="sm" disabled={!checked || !son} onClick={() => act(
        { title: `Hoàn thành ${r.code}?`, confirmLabel: "Hoàn thành", description: <Summary rows={[["Mã ĐH Sapo", r.orderCode ?? "—"], ["Khách", `${r.customerName} · ${r.customerPhone}`], ["Sản phẩm", r.item]]} /> },
        "customer.repair", A.storeConfirmCustomerRepair, r.id, { checked, sonEntered: son },
      )}>Hoàn thành</Button>
    </div>
  );
}

// Danh sách phiếu + hộp gửi xưởng / ghi chú
export function CustomerRepairList({ list, empty }: { list: CustomerRepair[]; empty: string }) {
  const now = new Date();
  const [sending, setSending] = useState<CustomerRepair | null>(null);
  const [noting, setNoting] = useState<CustomerRepair | null>(null);
  // bảng gọn: bấm 1 dòng để xem đầy đủ thông tin, lịch sử và nút của bước hiện tại
  const [open, setOpen] = useState<string | null>(null);
  if (!list.length) return <div className="p-4 md:p-5"><EmptyState>{empty}</EmptyState></div>;
  return (
    <>
      <div className="overflow-x-auto">
        <table className="wl-table">
          <thead><tr><th className="w-8" /><th>Mã</th><th>Mã ĐH Sapo</th><th>Khách</th><th>Sản phẩm</th><th>Bước hiện tại</th><th>Hẹn trả</th></tr></thead>
          <tbody>
            {list.map(r => {
              const isOpen = open === r.id, st = stepOf(r.status), late = isLate(r, now);
              return (
                <Fragment key={r.id}>
                  <tr className={cn("cursor-pointer", isOpen && "bg-brand-soft/30", r.status === "done" && "opacity-70")} onClick={() => setOpen(isOpen ? null : r.id)}>
                    <td><ChevronRight className={cn("size-4 text-subtle transition-transform duration-200", isOpen && "rotate-90")} /></td>
                    <td className="num font-bold text-brand">{r.code}</td>
                    <td className="num font-semibold">{r.orderCode ?? "—"}</td>
                    <td>{r.customerName}<div className="num text-[11.5px] text-subtle">{r.customerPhone}</div></td>
                    <td className="max-w-[260px] truncate">{r.item}</td>
                    <td><StatusPill tone={st.tone} dot>{st.label}</StatusPill></td>
                    <td className={cn("num whitespace-nowrap", late && "font-semibold text-bad")}>{fmtD(r.promisedAt)}{late && <div className="text-[11px]">trễ {daysLate(r.promisedAt, now)} ngày</div>}</td>
                  </tr>
                  {isOpen && (
                    <tr className="hover:!bg-transparent">
                      <td colSpan={7} className="!pt-0">
                        <div className="reveal"><RepairCard r={r} now={now} onSend={() => setSending(r)} onNote={() => setNoting(r)} /></div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {sending && <SendDialog r={sending} onClose={() => setSending(null)} />}
      {noting && <NoteDialog r={noting} onClose={() => setNoting(null)} />}
    </>
  );
}
