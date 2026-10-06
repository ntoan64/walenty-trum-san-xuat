"use client";

import { useState } from "react";
import { MessageSquarePlus, Phone } from "lucide-react";
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
  { key: "done", label: "Đã trả sale · hoàn thành", tone: "ok" },
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
          {r.status === "requested" && (
            <Button size="sm" onClick={() => act(
              { title: `QC nhận ${r.code} từ sale?`, confirmLabel: "Đã nhận hàng", description: <Summary rows={[["Mã ĐH Sapo", r.orderCode ?? "—"], ["Sản phẩm", r.item], ["Khách muốn sửa", r.request]]} /> },
              "customer.repair", A.receiveCustomerRepair, r.id,
            )}>Đã nhận hàng</Button>
          )}
          {r.status === "received" && <Button size="sm" onClick={onSend}>Gửi xưởng</Button>}
          {r.status === "sent" && (
            <Button size="sm" onClick={() => act(
              { title: `${ws ?? "Xưởng"} đã trả ${r.code}, QC kiểm tra đạt?`, confirmLabel: "Đã nhận về, kiểm tra xong", description: <Summary rows={[["Sản phẩm", r.item], ["Khách muốn sửa", r.request]]} /> },
              "customer.repair", A.customerRepairBack, r.id,
            )}>Xưởng trả về · QC kiểm tra</Button>
          )}
          {r.status === "returned" && (
            <Button size="sm" onClick={() => act(
              { title: `Trả ${r.code} cho sale?`, confirmLabel: "Trả sale · hoàn thành", description: <Summary rows={[["Khách", `${r.customerName} · ${r.customerPhone}`], ["Sản phẩm", r.item]]} /> },
              "customer.repair", A.customerRepairDone, r.id,
            )}>Trả sale · Hoàn thành</Button>
          )}
        </div>
      )}
    </article>
  );
}


// Danh sách phiếu + hộp gửi xưởng / ghi chú
export function CustomerRepairList({ list, empty }: { list: CustomerRepair[]; empty: string }) {
  const now = new Date();
  const [sending, setSending] = useState<CustomerRepair | null>(null);
  const [noting, setNoting] = useState<CustomerRepair | null>(null);
  return (
    <>
      <div className="grid grid-cols-1 gap-3 p-4 md:p-5 xl:grid-cols-2">
        {list.length
          ? list.map(r => <RepairCard key={r.id} r={r} now={now} onSend={() => setSending(r)} onNote={() => setNoting(r)} />)
          : <div className="xl:col-span-2"><EmptyState>{empty}</EmptyState></div>}
      </div>
      {sending && <SendDialog r={sending} onClose={() => setSending(null)} />}
      {noting && <NoteDialog r={noting} onClose={() => setNoting(null)} />}
    </>
  );
}
