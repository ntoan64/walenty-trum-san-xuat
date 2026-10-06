"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleCheck, Factory, MapPin, Pencil, Phone, Plus } from "lucide-react";
import { byId, DAY, isRepairLate, sum, type RepairTicket, type Workshop } from "@core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { matches } from "@/lib/search";
import { SearchBox } from "@/components/xf/search-box";
import { useStore, A } from "@/lib/store";
import { useAction, useConfirmAction } from "@/lib/use-action";
import { useDraft } from "@/lib/use-draft";
import { Summary } from "@/components/xf/confirm-provider";
import { Collapsible } from "@/components/xf/collapsible";
import { daysLate, fmtD, vnd } from "@/lib/format";
import { EmptyState, Field, PageHeader, Panel, StatCard, StatusPill, TableWrap } from "@/components/xf/basics";
import { PhotoStrip } from "@/components/xf/photos";
import { heldByWorkshop } from "@/lib/selectors";
import { nf } from "@/lib/format";

// Trang Xưởng may: theo dõi xưởng nào đang giữ hàng lỗi của mình mang về sửa, lỗi gì, giữ bao lâu
type WsForm = { name: string; area: string; contactName: string; phone: string };
const EMPTY: WsForm = { name: "", area: "", contactName: "", phone: "" };

function WorkshopFields({ f, setF, idp }: { f: WsForm; setF: (f: WsForm) => void; idp: string }) {
  return (
    <>
      <Field label="Tên xưởng" htmlFor={`${idp}-name`}>
        <input id={`${idp}-name`} className="field-input" maxLength={120} placeholder="VD: Xưởng Cô Sáu" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
      </Field>
      <Field label="Khu vực" htmlFor={`${idp}-area`}>
        <input id={`${idp}-area`} className="field-input" maxLength={60} placeholder="VD: Quận 12" value={f.area} onChange={e => setF({ ...f, area: e.target.value })} />
      </Field>
      <Field label="Người liên hệ" htmlFor={`${idp}-contact`}>
        <input id={`${idp}-contact`} className="field-input" maxLength={60} value={f.contactName} onChange={e => setF({ ...f, contactName: e.target.value })} />
      </Field>
      <Field label="Số điện thoại" htmlFor={`${idp}-phone`}>
        <input id={`${idp}-phone`} type="tel" inputMode="tel" className="field-input num" maxLength={15} value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} />
      </Field>
    </>
  );
}

/* ---------- Thêm xưởng ---------- */
function CreateWorkshop() {
  const act = useConfirmAction();
  const [f, setF, clear] = useDraft<WsForm>("workshop:new", EMPTY);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await act(
      { title: "Thêm xưởng?", confirmLabel: "Thêm xưởng", description: <Summary rows={[["Tên xưởng", f.name], ["Khu vực", f.area || "—"], ["Người liên hệ", f.contactName || "—"], ["Số điện thoại", f.phone]]} /> },
      "workshop.manage", A.createWorkshop, f,
    );
    if (r?.ok) clear();
  };
  return (
    <Collapsible title="Thêm xưởng" icon={Plus}>
      <form onSubmit={submit} className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] items-end gap-3 p-4 md:p-5">
        <WorkshopFields f={f} setF={setF} idp="nw" />
        <div><Button type="submit">Thêm xưởng</Button></div>
      </form>
    </Collapsible>
  );
}

/* ---------- Sửa xưởng ---------- */
function EditWorkshop({ w, onClose }: { w: Workshop; onClose: () => void }) {
  const act = useAction();
  const [f, setF] = useState<WsForm>({ name: w.name, area: w.area, contactName: w.contactName, phone: w.phone });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const r = await act("workshop.manage", A.updateWorkshop, w.id, f);
    setBusy(false);
    if (r.ok) onClose();
  };
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg text-brand">Sửa thông tin xưởng</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><WorkshopFields f={f} setF={setF} idp="ew" /></div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button onClick={save} disabled={busy}>Lưu</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function WorkshopsPage() {
  const { data: s, can } = useStore();
  // phụ liệu đang nằm ở từng xưởng (đã xuất cho lệnh chưa xong)
  const heldMat = heldByWorkshop(s);
  const confirmAct = useConfirmAction();
  const [editing, setEditing] = useState<Workshop | null>(null);
  const manage = can("workshop.manage");
  const now = new Date();
  const open = s.repairs.filter(r => r.status !== "closed");
  const held = (r: RepairTicket) => r.status === "sent" || r.status === "received"; // đang nằm ở xưởng
  const atWs = open.filter(held);
  const late = atWs.filter(r => isRepairLate(r, now));
  const holdingWs = new Set(atWs.map(r => r.workshop)).size;

  const [q, setQ] = useDraft("workshops:q", "");
  const groups = s.workshops
    .filter(w => matches(q, w.name, w.area, w.contactName, w.phone,
      open.filter(r => r.workshop === w.id).map(r => `${r.code} ${r.defect} ${r.items?.map(i => i.defect).join(" ") ?? ""}`).join(" ")))
    .map(w => {
      const list = open.filter(r => r.workshop === w.id);
      const holding = list.filter(held);
      const defects: Record<string, number> = {};
      holding.forEach(r => (r.items?.length ? r.items : [{ defect: r.defect, qty: r.qty }]).forEach(x => (defects[x.defect] = (defects[x.defect] ?? 0) + x.qty)));
      return {
        w, list, holding, defects,
        qty: sum(holding, r => r.qty),
        late: holding.filter(r => isRepairLate(r, now)).length,
        done: s.repairs.filter(r => r.workshop === w.id && r.status === "closed").length,
      };
    })
    // xưởng đang hợp tác lên trước; có hàng quá hạn / đang giữ nhiều lên đầu
    .sort((a, b) => Number(b.w.active) - Number(a.w.active) || b.late - a.late || b.qty - a.qty);

  return (
    <>
      <PageHeader
        eyebrow={<>Phân hệ sản xuất <span className="text-subtle">/</span> <span className="text-subtle">Xưởng gia công</span></>}
        title="Xưởng may & NCC"
        desc="Xưởng nào đang giữ hàng lỗi của mình mang về sửa, lỗi gì, giữ bao lâu."
        aside={
          <div className="grid w-full grid-cols-3 gap-2 min-[1500px]:w-auto">
            <StatCard className="min-[1500px]:min-w-[120px]" label="Đang ở xưởng sửa" value={sum(atWs, r => r.qty)} unit="cái" tone="brand" />
            <StatCard className="min-[1500px]:min-w-[120px]" label="Xưởng đang giữ" value={holdingWs} unit="xưởng" />
            <StatCard className="min-[1500px]:min-w-[120px]" label="Quá hạn" value={late.length} unit="phiếu" tone={late.length ? "alert" : "default"} />
          </div>
        }
      />

      {manage && <CreateWorkshop />}
      {s.workshops.length > 0 && <SearchBox value={q} onChange={setQ} placeholder="Tìm xưởng, SĐT, lỗi, phiếu…" label="Tìm xưởng" className="sm:w-80" />}
      {!groups.length && (
        <Panel><EmptyState>Chưa có xưởng nào. {manage ? "Thêm xưởng ở khối bên trên để giao lệnh sản xuất." : "Quản lý kho sẽ thêm xưởng."}</EmptyState></Panel>
      )}

      {groups.map(({ w, list, qty, late: nLate, defects, done }) => (
        <Panel
          key={w.id}
          icon={Factory}
          className={w.active ? "" : "opacity-60"}
          title={w.name}
          tag={<>
            {w.area && <span className="text-xs text-brown">{w.area}</span>}
            {!w.active && <StatusPill tone="muted">Ngừng hợp tác</StatusPill>}
          </>}
          actions={
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              {w.contactName && <span className="text-muted-foreground">{w.contactName}</span>}
              {w.phone && (
                <a href={`tel:${w.phone.replace(/\s/g, "")}`} className="num inline-flex items-center gap-1 rounded-md bg-surface px-2 py-1 text-brand hover:bg-surface-2">
                  <Phone className="size-3.5" /> {w.phone}
                </a>
              )}
              {manage && (
                <>
                  <Button size="sm" variant="secondary" onClick={() => setEditing(w)}><Pencil /> Sửa</Button>
                  <Button size="sm" variant="secondary" onClick={() => confirmAct(
                    w.active
                      ? { title: `Ngừng hợp tác với ${w.name}?`, confirmLabel: "Ngừng hợp tác", description: "Không giao lệnh mới cho xưởng này nữa. Lịch sử và phiếu cũ vẫn giữ nguyên, hợp tác lại được." }
                      : { title: `Hợp tác lại với ${w.name}?`, confirmLabel: "Hợp tác lại", description: "Xưởng sẽ xuất hiện lại khi tạo lệnh sản xuất." },
                    "workshop.manage", A.toggleWorkshop, w.id,
                  )}>{w.active ? "Ngừng" : "Hợp tác lại"}</Button>
                </>
              )}
            </div>
          }
          flush
        >
          {heldMat.get(w.id) && (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-brand-soft/30 px-4 py-2.5 text-[12.5px] md:px-5">
              <span className="font-semibold text-brand">Đang giữ phụ liệu:</span>
              {heldMat.get(w.id)!.map(x => (
                <span key={x.material.id} className="rounded-md bg-surface px-2 py-0.5"><b className="num">{x.material.code}</b> {x.material.name} · <b className="num">{nf(x.qty, 1)}</b> {x.material.unit}</span>
              ))}
            </div>
          )}
          {(w.address || w.note || !!w.rates?.length) && (
            <div className="flex flex-col gap-1.5 border-b border-line px-4 py-2.5 text-[12.5px] md:px-5">
              {(w.address || w.note) && (
                <p className="text-muted-foreground">
                  {w.address && <span className="inline-flex items-start gap-1"><MapPin className="mt-0.5 size-3.5 shrink-0" />{w.address}</span>}
                  {w.address && w.note && " · "}{w.note}
                </p>
              )}
              {!!w.rates?.length && (
                <details className="group">
                  <summary className="cursor-pointer font-semibold text-brand select-none">Bảng giá gia công ({w.rates.length})</summary>
                  <div className="mt-1.5 grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2 xl:grid-cols-3">
                    {w.rates.map(r => (
                      <div key={r.item} className="flex items-baseline justify-between gap-2 border-b border-dashed border-line py-0.5">
                        <span>{r.item}{r.minQty && r.minQty > 1 ? <span className="text-subtle"> · từ {r.minQty} cái</span> : null}{r.invoice ? <span className="text-ok"> · có HĐ</span> : null}</span>
                        <span className="num shrink-0 text-right font-semibold">{r.price != null ? vnd(r.price) : <span className="font-normal text-muted-foreground">{r.note ?? "—"}</span>}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
          {list.length ? (
            <>
              <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-2 md:px-5">
                <span className="text-[13px]">
                  Đang giữ <b className="num text-brand">{qty}</b> cái hàng lỗi
                </span>
                {Object.entries(defects).map(([d, n]) => (
                  <StatusPill key={d} tone="warn">{d}: <span className="num">{n}</span></StatusPill>
                ))}
                {nLate > 0 && <StatusPill tone="bad" dot>{nLate} phiếu quá hạn</StatusPill>}
              </div>
              <TableWrap>
                <table className="wl-table">
                  <thead>
                    <tr><th>Phiếu</th><th>Sản phẩm</th><th className="r">SL</th><th>Lỗi</th><th>Gửi ngày</th><th className="r">Đã giữ</th><th>Hạn trả</th><th>Trạng thái</th></tr>
                  </thead>
                  <tbody>
                    {list.map(r => {
                      const o = byId(s.orders, r.order);
                      const p = o && byId(s.products, o.product);
                      const isLate = isRepairLate(r, now);
                      const days = Math.max(0, Math.floor((now.getTime() - r.sentAt.getTime()) / DAY));
                      return (
                        <tr key={r.id}>
                          <td className="whitespace-nowrap">
                            <Link href={`/lenh-san-xuat/${r.order}`} className="num font-bold text-brand hover:underline">{r.code}</Link>
                            <div className="num text-[11.5px] text-subtle">{o?.code}{r.round > 1 ? ` · vòng ${r.round}` : ""}</div>
                          </td>
                          <td>{p?.name}</td>
                          <td className="r num font-semibold">{r.qty}</td>
                          <td className="text-[13px]">{r.items?.length ? r.items.map((x, k) => <div key={k} className="whitespace-nowrap"><StatusPill tone="muted" className="mr-1">{x.size}</StatusPill>{x.defect} ×{x.qty} <PhotoStrip photos={x.photos} size={28} className="ml-1" /></div>) : <StatusPill tone="warn">{r.defect}</StatusPill>}</td>
                          <td className="num">{fmtD(r.sentAt)}</td>
                          <td className="r num">{days} ngày</td>
                          <td className={`num ${isLate ? "font-semibold text-bad" : ""}`}>
                            {fmtD(r.dueAt)}{isLate && <span className="ml-1 font-sans text-xs">(trễ {daysLate(r.dueAt, now)} ngày)</span>}
                          </td>
                          <td>
                            {r.status === "returned" ? <StatusPill tone="info" dot>Đã trả lại, chờ QC</StatusPill>
                              : isLate ? <StatusPill tone="bad" dot>{r.status === "sent" ? "Chưa nhận" : "Đang sửa"} · quá hạn</StatusPill>
                              : <StatusPill tone="warn" dot>{r.status === "sent" ? "Đã gửi, chưa nhận" : "Đang sửa"}</StatusPill>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrap>
            </>
          ) : (
            <p className="flex items-center gap-2 px-4 py-4 text-[13px] text-muted-foreground md:px-5">
              <CircleCheck className="size-4 text-ok" /> Không giữ hàng lỗi nào của mình.
              {done > 0 && <span className="text-subtle">Đã sửa xong {done} phiếu.</span>}
            </p>
          )}
        </Panel>
      ))}
      {editing && <EditWorkshop w={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
