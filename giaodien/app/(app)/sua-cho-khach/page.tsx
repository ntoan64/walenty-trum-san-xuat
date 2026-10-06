"use client";

import { useState } from "react";
import { MessageSquarePlus, Phone, Plus, Scissors } from "lucide-react";
import { byId, DAY, type CustomerRepair, type CustomerRepairStatus } from "@core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore, A } from "@/lib/store";
import { useAskAction, useConfirmAction } from "@/lib/use-action";
import { useDraft } from "@/lib/use-draft";
import { daysLate, fmtD, fmtDT, isoDateVN } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Summary } from "@/components/xf/confirm-provider";
import { Collapsible } from "@/components/xf/collapsible";
import { EmptyState, Field, PageHeader, Panel, StatCard, StatusPill, type PillTone } from "@/components/xf/basics";

const STEPS: { key: CustomerRepairStatus; label: string; tone: PillTone }[] = [
  { key: "received", label: "Đã nhận, chờ gửi xưởng", tone: "warn" },
  { key: "sent", label: "Xưởng đang sửa", tone: "info" },
  { key: "returned", label: "Sửa xong, chờ trả khách", tone: "brand" },
  { key: "done", label: "Đã trả khách", tone: "ok" },
];
const stepOf = (k: CustomerRepairStatus) => STEPS.find(s => s.key === k)!;
const isLate = (r: CustomerRepair, now: Date) => r.status !== "done" && r.promisedAt < now;

/* ---------- Nhận đồ từ khách ---------- */
type Form = { customerName: string; customerPhone: string; item: string; size: string; request: string; note: string; promisedDate: string };

function ReceiveFromCustomer() {
  const act = useConfirmAction();
  const blank = (): Form => ({ customerName: "", customerPhone: "", item: "", size: "", request: "", note: "", promisedDate: isoDateVN(new Date(Date.now() + 7 * DAY)) });
  const [f, setF, clear] = useDraft<Form>("customer:new", blank);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await act(
      {
        title: "Nhận đồ khách gửi sửa?", confirmLabel: "Nhận đồ",
        description: <Summary rows={[
          ["Khách", `${f.customerName} · ${f.customerPhone}`], ["Sản phẩm", `${f.item}${f.size ? ` · size ${f.size.toUpperCase()}` : ""}`],
          ["Khách muốn sửa", f.request], ...(f.note.trim() ? [["Ghi chú", f.note] as [string, string]] : []),
          ["Hẹn trả", f.promisedDate.split("-").reverse().join("/")],
        ]} />,
      },
      "customer.repair", A.createCustomerRepair, f,
    );
    if (r?.ok) clear(blank());
  };
  return (
    <Collapsible title="Nhận đồ khách gửi sửa" icon={Plus} defaultOpen>
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 md:p-5">
        <Field label="Tên khách" htmlFor="cr-name">
          <input id="cr-name" className="field-input" maxLength={60} value={f.customerName} onChange={e => setF({ ...f, customerName: e.target.value })} />
        </Field>
        <Field label="Số điện thoại khách" htmlFor="cr-phone">
          <input id="cr-phone" type="tel" inputMode="tel" className="field-input num" maxLength={15} value={f.customerPhone} onChange={e => setF({ ...f, customerPhone: e.target.value })} />
        </Field>
        <Field label="Sản phẩm" htmlFor="cr-item">
          <input id="cr-item" list="cr-products" className="field-input" maxLength={120} placeholder="VD: Đầm lụa đen DM05" value={f.item} onChange={e => setF({ ...f, item: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Size" htmlFor="cr-size">
            <input id="cr-size" className="field-input uppercase" maxLength={10} value={f.size} onChange={e => setF({ ...f, size: e.target.value })} />
          </Field>
          <Field label="Hẹn trả khách" htmlFor="cr-due">
            <input id="cr-due" type="date" min={isoDateVN(new Date())} className="field-input num" value={f.promisedDate} onChange={e => setF({ ...f, promisedDate: e.target.value })} />
          </Field>
        </div>
        <Field label="Khách muốn sửa gì" htmlFor="cr-req" className="sm:col-span-2">
          <textarea id="cr-req" rows={2} maxLength={1000} className="field-input resize-y" placeholder="Nhân viên ghi lại yêu cầu của khách, VD: lên lai 2cm, bóp eo 1cm, thay nút…"
            value={f.request} onChange={e => setF({ ...f, request: e.target.value })} />
        </Field>
        <Field label="Ghi chú thêm (tùy chọn)" htmlFor="cr-note" className="sm:col-span-2">
          <textarea id="cr-note" rows={2} maxLength={1000} className="field-input resize-y" placeholder="Tình trạng khi nhận, phụ kiện kèm theo…"
            value={f.note} onChange={e => setF({ ...f, note: e.target.value })} />
        </Field>
        <div className="sm:col-span-2 lg:col-span-4"><Button type="submit">Nhận đồ</Button></div>
      </form>
    </Collapsible>
  );
}

/* ---------- Chọn xưởng để gửi ---------- */
function SendDialog({ r, onClose }: { r: CustomerRepair; onClose: () => void }) {
  const { data: s } = useStore();
  const act = useAskAction();
  const list = s.workshops.filter(w => w.active);
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
            <select id="cr-ws" className="field-input" value={ws} onChange={e => setWs(e.target.value)}>
              {list.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
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
          {r.status === "received" && <Button size="sm" onClick={onSend}>Gửi xưởng</Button>}
          {r.status === "sent" && (
            <Button size="sm" onClick={() => act(
              { title: `${ws ?? "Xưởng"} đã trả ${r.code}?`, confirmLabel: "Đã nhận về", description: <Summary rows={[["Sản phẩm", r.item], ["Khách muốn sửa", r.request]]} /> },
              "customer.repair", A.customerRepairBack, r.id,
            )}>Xưởng trả về</Button>
          )}
          {r.status === "returned" && (
            <Button size="sm" onClick={() => act(
              { title: `Trả ${r.code} cho khách?`, confirmLabel: "Đã trả khách", description: <Summary rows={[["Khách", `${r.customerName} · ${r.customerPhone}`], ["Sản phẩm", r.item]]} /> },
              "customer.repair", A.customerRepairDone, r.id,
            )}>Đã trả khách</Button>
          )}
        </div>
      )}
    </article>
  );
}

export default function CustomerRepairsPage() {
  const { data: s, can } = useStore();
  const now = new Date();
  const all = (s.customerRepairs ?? []).slice().sort((a, b) => Number(isLate(b, now)) - Number(isLate(a, now)) || a.promisedAt.getTime() - b.promisedAt.getTime());
  const [tab, setTab] = useDraft<"open" | CustomerRepairStatus>("customer:tab", "open");
  const [q, setQ] = useDraft("customer:q", "");
  const [sending, setSending] = useState<CustomerRepair | null>(null);
  const [noting, setNoting] = useState<CustomerRepair | null>(null);

  const count = (k: "open" | CustomerRepairStatus) => all.filter(r => (k === "open" ? r.status !== "done" : r.status === k)).length;
  const query = q.trim().toLowerCase();
  const list = all
    .filter(r => (tab === "open" ? r.status !== "done" : r.status === tab))
    .filter(r => !query || `${r.code} ${r.customerName} ${r.customerPhone} ${r.item} ${r.request}`.toLowerCase().includes(query));
  const late = all.filter(r => isLate(r, now)).length;

  return (
    <>
      <PageHeader
        eyebrow={<>Cửa hàng <span className="text-subtle">/</span> <span className="text-subtle">Sửa đồ cho khách</span></>}
        title="Đồ khách gửi sửa"
        desc="Nhận đồ khách mang tới cửa hàng, gửi xưởng sửa và theo dõi tới khi trả khách."
        aside={
          <div className="grid w-full grid-cols-3 gap-2 min-[1500px]:w-auto">
            <StatCard className="min-[1500px]:min-w-[120px]" label="Đang xử lý" value={count("open")} unit="món" tone="brand" />
            <StatCard className="min-[1500px]:min-w-[120px]" label="Chờ trả khách" value={count("returned")} unit="món" tone="brown" />
            <StatCard className="min-[1500px]:min-w-[120px]" label="Trễ hẹn" value={late} unit="món" tone={late ? "alert" : "default"} />
          </div>
        }
      />
      {can("customer.repair") && <ReceiveFromCustomer />}
      <datalist id="cr-products">{s.products.map(p => <option key={p.id} value={`${p.name} ${p.sku}`} />)}</datalist>

      <Panel
        title="Danh sách" icon={Scissors} flush
        actions={
          <input aria-label="Tìm đồ khách" placeholder="Tìm tên, SĐT, mã KS…" className="field-input !min-h-9 !w-56 !bg-surface !py-1.5"
            value={q} onChange={e => setQ(e.target.value)} />
        }
      >
        <div role="tablist" aria-label="Lọc theo bước" className="flex gap-1 overflow-x-auto px-4 pt-3 md:px-5">
          {([["open", "Đang xử lý"], ...STEPS.map(x => [x.key, x.label])] as [typeof tab, string][]).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)}
              className={cn("rounded-md px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap",
                tab === k ? "bg-brand text-brand-fg" : "bg-surface-2 text-muted-foreground hover:bg-surface-3")}>
              {label} <span className="num opacity-70">{count(k)}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 p-4 md:p-5 xl:grid-cols-2">
          {list.length
            ? list.map(r => <RepairCard key={r.id} r={r} now={now} onSend={() => setSending(r)} onNote={() => setNoting(r)} />)
            : <div className="xl:col-span-2"><EmptyState>{all.length ? "Không có phiếu nào ở mục này." : "Chưa có đồ khách gửi sửa. Nhận đồ ở khối bên trên."}</EmptyState></div>}
        </div>
      </Panel>
      {sending && <SendDialog r={sending} onClose={() => setSending(null)} />}
      {noting && <NoteDialog r={noting} onClose={() => setNoting(null)} />}
    </>
  );
}
