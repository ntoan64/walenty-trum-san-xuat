"use client";

import { Plus, Scissors } from "lucide-react";
import { DAY, type CustomerRepairStatus } from "@core";
import { Button } from "@/components/ui/button";
import { useStore, A } from "@/lib/store";
import { useConfirmAction } from "@/lib/use-action";
import { useDraft } from "@/lib/use-draft";
import { isoDateVN } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Summary } from "@/components/xf/confirm-provider";
import { Collapsible } from "@/components/xf/collapsible";
import { Field, PageHeader, Panel, StatCard } from "@/components/xf/basics";
import { CustomerRepairList, isLate, STEPS } from "@/components/xf/customer-repair";

/* ---------- Nhận đồ từ khách ---------- */
type Form = { customerName: string; customerPhone: string; orderCode: string; item: string; size: string; request: string; note: string; promisedDate: string };

function ReceiveFromCustomer() {
  const act = useConfirmAction();
  const blank = (): Form => ({ customerName: "", customerPhone: "", orderCode: "", item: "", size: "", request: "", note: "", promisedDate: isoDateVN(new Date(Date.now() + 7 * DAY)) });
  const [f, setF, clear] = useDraft<Form>("customer:new", blank);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await act(
      {
        title: "Nhận đồ khách gửi sửa?", confirmLabel: "Nhận đồ",
        description: <Summary rows={[
          ["Khách", `${f.customerName} · ${f.customerPhone}`], ["Mã ĐH Sapo", f.orderCode.trim().toUpperCase() || "—"], ["Sản phẩm", f.item],
          ["Khách muốn sửa", f.request], ...(f.note.trim() ? [["Ghi chú", f.note] as [string, string]] : []),
          ["Hẹn trả", f.promisedDate.split("-").reverse().join("/")],
        ]} />,
      },
      "customer.repair", A.createCustomerRepair, f,
    );
    if (r?.ok) clear(blank());
  };
  return (
    <Collapsible title="Sale tạo yêu cầu gửi sửa" icon={Plus} defaultOpen>
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 md:p-5">
        <Field label="Tên khách" htmlFor="cr-name">
          <input id="cr-name" className="field-input" maxLength={60} value={f.customerName} onChange={e => setF({ ...f, customerName: e.target.value })} />
        </Field>
        <Field label="Số điện thoại khách" htmlFor="cr-phone">
          <input id="cr-phone" type="tel" inputMode="tel" className="field-input num" maxLength={15} value={f.customerPhone} onChange={e => setF({ ...f, customerPhone: e.target.value })} />
        </Field>
        <Field label="Mã ĐH Sapo (bắt buộc)" htmlFor="cr-order">
          <input id="cr-order" className="field-input num uppercase" maxLength={30} placeholder="VD: SON15488" value={f.orderCode} onChange={e => setF({ ...f, orderCode: e.target.value })} />
        </Field>
        <Field label="Sản phẩm" htmlFor="cr-item">
          <input id="cr-item" list="cr-products" className="field-input" maxLength={120} placeholder="VD: Đầm lụa đen DM05" value={f.item} onChange={e => setF({ ...f, item: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
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
export default function CustomerRepairsPage() {
  const { data: s, can } = useStore();
  const now = new Date();
  const all = (s.customerRepairs ?? []).slice().sort((a, b) => Number(isLate(b, now)) - Number(isLate(a, now)) || a.promisedAt.getTime() - b.promisedAt.getTime());
  const [tab, setTab] = useDraft<"open" | CustomerRepairStatus>("customer:tab", "open");
  const [q, setQ] = useDraft("customer:q", "");

  const count = (k: "open" | CustomerRepairStatus) => all.filter(r => (k === "open" ? r.status !== "done" : r.status === k)).length;
  const query = q.trim().toLowerCase();
  const list = all
    .filter(r => (tab === "open" ? r.status !== "done" : r.status === tab))
    .filter(r => !query || `${r.code} ${r.orderCode ?? ""} ${r.customerName} ${r.customerPhone} ${r.item} ${r.request}`.toLowerCase().includes(query));
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
            <StatCard className="min-[1500px]:min-w-[120px]" label="Chờ trả sale" value={count("returned")} unit="món" tone="brown" />
            <StatCard className="min-[1500px]:min-w-[120px]" label="Trễ hẹn" value={late} unit="món" tone={late ? "alert" : "default"} />
          </div>
        }
      />
      {can("customer.repair") && <ReceiveFromCustomer />}
      <datalist id="cr-products">{s.products.map(p => <option key={p.id} value={`${p.name} ${p.sku}`} />)}</datalist>

      <Panel
        title="Danh sách" icon={Scissors} flush
        actions={
          <input aria-label="Tìm đồ khách" placeholder="Tìm tên, SĐT, mã ĐH, mã KS…" className="field-input !min-h-9 !w-56 !bg-surface !py-1.5"
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
        <CustomerRepairList list={list} empty={all.length ? "Không có phiếu nào ở mục này." : "Chưa có đồ khách gửi sửa. Sale tạo yêu cầu ở khối bên trên."} />
      </Panel>
    </>
  );
}
