"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Coins, PackageOpen, Pencil, Plus, Scale, Settings2, Trash2, Wrench } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  byId, closeChecklist, canClose, DEFECT_KIND, DEFECTS, isBalanced, knownDefects, sizeProgress, isOrderLate, LOSS_ALLOWED, SIZES,
  type Batch, type DefectLine, type ProductionOrder,
} from "@core";
import { Button } from "@/components/ui/button";
import { useStore, A } from "@/lib/store";
import { useAction, useConfirmAction } from "@/lib/use-action";
import { Summary } from "@/components/xf/confirm-provider";
import { fmtD, fmtDT, isoDateVN, nf, pct, vnd } from "@/lib/format";
import { prodOf, repairsOf, wsName } from "@/lib/actions";
import { balanceOf, fabricFor, issuedFor } from "@/lib/selectors";
import { EmptyState, Field, NumberField, PageHeader, Panel, StatusPill, TableWrap } from "@/components/xf/basics";
import { BalanceBar, BalanceEquation, BalanceLegend, StepProgress } from "@/components/xf/balance";
import { RepairTable } from "@/components/xf/repair-table";
import { ConfirmButton } from "@/components/xf/confirm-dialog";
import { useDraft } from "@/lib/use-draft";
import { cn } from "@/lib/utils";

function ActionBox({ title, desc, children, tone }: { title: string; desc?: React.ReactNode; children?: React.ReactNode; tone?: "warn" }) {
  return (
    <div className={cn("rounded-lg p-3.5", tone === "warn" ? "bg-warn-soft" : "bg-surface-low")}>
      <h3 className="mb-1 text-[13.5px] font-semibold">{title}</h3>
      {desc && <p className="mb-2.5 text-[12.5px] text-muted-foreground">{desc}</p>}
      {children}
    </div>
  );
}

function ReceiveForm({ o, max, ws }: { o: ProductionOrder; max: number; ws: string }) {
  const prog = sizeProgress(o);
  return prog.length ? <ReceiveBySize o={o} max={max} ws={ws} prog={prog} /> : <ReceiveTotal o={o} max={max} ws={ws} />;
}

function ReceiveBySize({ o, max, ws, prog }: { o: ProductionOrder; max: number; ws: string; prog: ReturnType<typeof sizeProgress> }) {
  const act = useConfirmAction();
  const { data: s } = useStore();
  const variants = byId(s.products, o.product)?.variants;
  const [v, setV] = useDraft<Record<string, string>>(`rcv-size:${o.id}`, () => Object.fromEntries(prog.map(p => [p.size, String(p.missing)])));
  const sizes = prog.map(p => ({ size: p.size, qty: Math.max(0, Math.floor(+(v[p.size] ?? 0) || 0)) }));
  const total = sizes.reduce((t, x) => t + x.qty, 0);
  const submit = async () => {
    const r = await act(
      { title: "Nhận hàng từ xưởng?", confirmLabel: "Nhận hàng",
        description: <Summary rows={[
          ["Lệnh", o.code], ["Xưởng", ws],
          ["Nhận theo size", sizes.filter(x => x.qty).map(x => `${x.size}: ${x.qty}`).join(" · ") || "—"],
          ["Tổng nhận", `${total} cái`], ["Còn chưa trả sau đợt này", `${max - total} cái`],
        ]} /> },
      "order.receive", A.receive, o.id, { sizes: sizes.filter(x => x.qty) },
    );
    // nhận xong: ô mỗi size về số còn thiếu mới
    if (r?.ok) setV(Object.fromEntries(prog.map(p => [p.size, String(Math.max(0, p.missing - (sizes.find(x => x.size === p.size)?.qty ?? 0)))])));
  };
  return (
    <ActionBox title="Nhận hàng từ xưởng (theo size)" desc={`Xưởng còn ${max} cái chưa trả. Nhập số nhận đợt này của từng size, mỗi đợt QC riêng.`}>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-2">
        {prog.map(p => (
          <label key={p.size} className={cn("flex flex-col gap-1 rounded-lg p-2", p.missing ? "bg-surface" : "bg-ok-soft/60")}>
            <span className="flex items-baseline justify-between gap-1 text-xs">
              <b className="text-brand">{p.size}</b>
              <span className={p.missing ? "text-bad" : "text-ok"}>{p.missing ? `thiếu ${p.missing}` : "đủ"}</span>
            </span>
            {variants?.find(x => x.size === p.size) && <span className="num -mt-1 text-[10.5px] text-subtle">{variants.find(x => x.size === p.size)!.sku}</span>}
            <input type="number" min={0} max={p.missing} step={1} inputMode="numeric" disabled={!p.missing} aria-label={`Số nhận size ${p.size}`}
              className="field-input num !min-h-9 !py-1.5" value={p.missing ? v[p.size] ?? "" : "0"}
              onChange={e => setV({ ...v, [p.size]: e.target.value })} />
          </label>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[13px]">Đợt này nhận <b className="num text-brand">{total}</b> cái</span>
        <Button onClick={submit} disabled={!total}>Nhận hàng</Button>
      </div>
    </ActionBox>
  );
}

function ReceiveTotal({ o, max, ws }: { o: ProductionOrder; max: number; ws: string }) {
  const act = useConfirmAction();
  const [v, setV] = useDraft(`rcv:${o.id}`, String(max));
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    const r = await act(
      { title: "Nhận hàng từ xưởng?", confirmLabel: "Nhận hàng",
        description: <Summary rows={[["Lệnh", o.code], ["Xưởng", ws], ["Số lượng nhận", `${+v} cái`], ["Còn chưa trả sau đợt này", `${max - +v} cái`]]} /> },
      "order.receive", A.receive, o.id, +v,
    );
    if (!r) return;
    setErr(r.ok ? null : r.error);
    if (r.ok) setV(String(Math.max(0, max - +v)));
  };
  return (
    <ActionBox title="Nhận hàng từ xưởng" desc={`Xưởng còn ${max} cái chưa trả. Mỗi đợt nhận sẽ chờ QC riêng.`}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
        <NumberField id={`rcv-${o.id}`} label="Số lượng nhận đợt này" min={1} max={max} step={1} value={v} onChange={setV} error={err} />
        <Button onClick={submit} className={err ? "mb-5" : ""}>Nhận hàng</Button>
      </div>
    </ActionBox>
  );
}

type DLine = { key: number; kind: DefectLine["kind"]; size: string; defect: string; qty: string };

// QC tự nhập từng dòng lỗi: loại lỗi, size, mô tả (gợi ý sẵn nhưng gõ tự do), số lượng. Pass tự tính.
function QCForm({ o, b }: { o: ProductionOrder; b: Batch }) {
  const act = useConfirmAction();
  const { data: s } = useStore();
  // gợi ý = lỗi QC đã từng tự ghi + danh sách chuẩn
  const suggest = knownDefects(s.orders, s.repairs, DEFECTS);
  const sizes = (b.sizes?.length ? b.sizes : o.sizes)?.map(x => x.size) ?? [];
  const [lines, setLines] = useDraft<DLine[]>(`qc:${b.id}:lines`, []);
  const [seq, setSeq] = useDraft(`qc:${b.id}:seq`, 1);
  const toLines = (): DefectLine[] => lines.map(l => ({ kind: l.kind, size: l.size, defect: l.defect, qty: Math.floor(+l.qty || 0) }));
  const fails = toLines().reduce((t, l) => t + l.qty, 0);
  const pass = b.received - fails;
  const set = (key: number, patch: Partial<DLine>) => setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)));
  const add = () => { setLines([...lines, { key: seq, kind: "sua", size: sizes[0] ?? "", defect: "", qty: "1" }]); setSeq(seq + 1); };

  const submit = () => {
    const ls = toLines();
    act(
      { title: "Lưu kết quả QC?", confirmLabel: "Lưu kết quả",
        description: (
          <>
            <Summary rows={[
              ["Đợt nhận", `${fmtDT(b.receivedAt)} · ${b.received} cái`],
              ["Pass (nhập kho)", `${pass} cái`],
              ...ls.map(l => [`${DEFECT_KIND[l.kind]} · ${l.size}`, `${l.defect} × ${l.qty}`] as [string, string]),
            ]} />
            {ls.some(l => l.kind === "sua") && <p className="mt-2 text-xs">Sẽ tự tạo phiếu trả sửa về xưởng cho các dòng lỗi may.</p>}
          </>
        ) },
      "qc.save", A.saveQC, o.id, b.id, { lines: ls },
    );
  };

  return (
    <ActionBox
      title={`QC đợt nhận ${fmtDT(b.receivedAt)} · ${b.received} cái${b.sizes?.length ? ` (${b.sizes.map(x => `${x.size}:${x.qty}`).join(" ")})` : ""}`}
      desc="Không có lỗi thì bấm Lưu luôn. Có lỗi thì thêm từng dòng: cách xử lý, size, tự ghi lỗi gì, số lượng."
    >
      <div className="flex flex-col gap-2">
        {lines.map((l, i) => (
          <div key={l.key} className="row-in grid grid-cols-2 gap-1.5 rounded-lg bg-surface p-2 sm:grid-cols-[1.3fr_80px_1.6fr_70px_32px] sm:items-center">
            <select aria-label={`Cách xử lý dòng ${i + 1}`} title="Cách xử lý hàng lỗi" className="field-input col-span-2 !min-h-9 !py-1.5 sm:col-span-1" value={l.kind}
              onChange={e => set(l.key, { kind: e.target.value as DefectLine["kind"] })}>
              {(Object.keys(DEFECT_KIND) as DefectLine["kind"][]).map(k => <option key={k} value={k}>{DEFECT_KIND[k]}</option>)}
            </select>
            {sizes.length ? (
              <select aria-label={`Size dòng ${i + 1}`} className="field-input !min-h-9 !py-1.5" value={l.size} onChange={e => set(l.key, { size: e.target.value })}>
                {sizes.map(z => <option key={z}>{z}</option>)}
              </select>
            ) : (
              <input aria-label={`Size dòng ${i + 1}`} list="sizes" placeholder="Size" className="field-input !min-h-9 !py-1.5 uppercase" value={l.size} onChange={e => set(l.key, { size: e.target.value.toUpperCase() })} />
            )}
            <input aria-label={`Số lượng dòng ${i + 1}`} type="number" min={1} step={1} className="field-input num !min-h-9 !py-1.5 sm:order-4" value={l.qty} onChange={e => set(l.key, { qty: e.target.value })} />
            <input aria-label={`Lỗi gì dòng ${i + 1}`} list="defects" placeholder="Ghi lỗi gì, VD: Bỏ mũi ở tay" className="field-input col-span-2 !min-h-9 !py-1.5 sm:order-3 sm:col-span-1"
              value={l.defect} onChange={e => set(l.key, { defect: e.target.value })} />
            <button type="button" aria-label={`Xóa dòng lỗi ${i + 1}`} onClick={() => setLines(lines.filter(x => x.key !== l.key))}
              className="col-span-2 justify-self-end rounded-md p-1.5 text-subtle hover:bg-bad-soft hover:text-bad sm:order-5 sm:col-span-1">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        <datalist id="defects">{suggest.map(d => <option key={d} value={d} />)}</datalist>
        <datalist id="sizes">{SIZES.map(z => <option key={z} value={z} />)}</datalist>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={add}><Plus /> Thêm dòng lỗi</Button>
          <span className={cn("text-[13px]", pass < 0 ? "text-bad" : "")}>
            Pass <b className="num text-ok">{pass}</b> · lỗi <b className="num">{fails}</b> / {b.received}
          </span>
        </div>
        <div className="flex justify-end"><Button onClick={submit} disabled={pass < 0}>Lưu kết quả QC</Button></div>
      </div>
      <p className="mt-1.5 text-[11.5px] text-subtle">Ảnh lỗi sẽ bắt buộc khi nối Cloudinary (bản sau).</p>
    </ActionBox>
  );
}

function LossForm({ o, max }: { o: ProductionOrder; max: number }) {
  const act = useConfirmAction();
  const { data: s } = useStore();
  const [v, setV] = useDraft(`loss:${o.id}`, "1");
  const [err, setErr] = useState<string | null>(null);
  const fab = fabricFor(s, o);
  const n = Math.max(0, Math.floor(+v || 0));
  const total = o.loss + n;
  return (
    <ActionBox
      title="Xưởng báo hao hụt (thiếu vải)"
      desc={<>
        Hao hụt = vải giao đủ làm <b>{o.qty}</b> cái nhưng xưởng chỉ ra được ít hơn.
        {fab.meters > 0 && <> Đã giao <b className="num">{nf(fab.meters, 1)} {fab.unit}</b> vải ({nf(fab.perUnit, 2)} {fab.unit}/cái).</>}
        {" "}Mức cho phép {LOSS_ALLOWED * 100}% ({Math.floor(o.qty * LOSS_ALLOWED)} cái). Cần Quản lý kho duyệt.
      </>}
    >
      {n > 0 && (
        <p className={cn("mb-2 rounded-md px-2.5 py-1.5 text-[12.5px]", total / o.qty > LOSS_ALLOWED ? "bg-bad-soft text-bad" : "bg-surface text-fg")}>
          Thiếu <b className="num">{n}</b> cái{fab.perUnit > 0 && <> ≈ <b className="num">{nf(n * fab.perUnit, 1)} {fab.unit}</b> vải</>}
          {" "}· tổng hao hụt lệnh <b className="num">{pct(total / o.qty)}</b>{total / o.qty > LOSS_ALLOWED && " (vượt mức cho phép)"}
        </p>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
        <NumberField id={`loss-${o.id}`} label="Số cái hao hụt" min={1} max={max} step={1} value={v} onChange={setV} error={err} />
        <Button
          variant="secondary"
          className={err ? "mb-5" : ""}
          onClick={async () => {
            const r = await act(
              { title: "Ghi hao hụt?", confirmLabel: "Ghi hao hụt",
                description: <Summary rows={[["Lệnh", o.code], ["Hao hụt", `${n} cái${fab.perUnit ? ` ≈ ${nf(n * fab.perUnit, 1)} ${fab.unit} vải` : ""}`], ["Tổng hao hụt lệnh", pct(total / o.qty)], ["Mức cho phép", `${LOSS_ALLOWED * 100}%`]]} /> },
              "loss.report", A.reportLoss, o.id, +v,
            );
            if (r) setErr(r.ok ? null : r.error);
          }}
        >
          Ghi hao hụt
        </Button>
      </div>
    </ActionBox>
  );
}

/* ---------- Admin: sửa lệnh ---------- */
function EditOrderDialog({ o, onClose }: { o: ProductionOrder; onClose: () => void }) {
  const { data: s } = useStore();
  const act = useAction();
  const beforeCut = o.step === "cut";
  const [due, setDue] = useState(isoDateVN(o.dueAt));
  const [ws, setWs] = useState(o.workshop);
  const [sizes, setSizes] = useState((o.sizes?.length ? o.sizes : [{ size: "M", qty: o.qty }]).map(z => ({ size: z.size, qty: String(z.qty) })));
  const [busy, setBusy] = useState(false);
  const total = sizes.reduce((t, z) => t + Math.floor(+z.qty || 0), 0);
  const save = async () => {
    setBusy(true);
    const r = await act("order.admin", A.editOrder, o.id, {
      dueDate: due,
      ...(beforeCut && { workshopId: ws, sizes: sizes.map(z => ({ size: z.size, qty: Math.floor(+z.qty || 0) })) }),
    });
    setBusy(false);
    if (r.ok) onClose();
  };
  return (
    <Dialog open onOpenChange={x => { if (!x) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg text-brand">Sửa lệnh {o.code}</DialogTitle>
          <DialogDescription>
            {beforeCut ? "Lệnh chưa cắt: đổi được xưởng, ngày và số lượng. Phụ liệu tự xuất thêm / hoàn lại phần chênh lệch." : "Lệnh đã cắt: chỉ đổi được ngày dự kiến."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Ngày dự kiến xong" htmlFor="eo-due">
            <input id="eo-due" type="date" className="field-input num" value={due} onChange={e => setDue(e.target.value)} />
          </Field>
          {beforeCut && (
            <Field label="Xưởng" htmlFor="eo-ws">
              <select id="eo-ws" className="field-input" value={ws} onChange={e => setWs(e.target.value)}>
                {s.workshops.filter(w => w.active || w.id === o.workshop).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Field>
          )}
        </div>
        {beforeCut && (
          <div>
            <div className="eyebrow mb-1.5">Số lượng theo size · tổng <span className="num text-brand">{total}</span> (đang {o.qty})</div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2">
              {sizes.map((z, i) => (
                <label key={z.size} className="flex flex-col gap-1 rounded-lg bg-surface-2 p-2">
                  <span className="text-xs font-bold text-brand">{z.size}</span>
                  <input type="number" min={0} step={1} aria-label={`Số lượng size ${z.size}`} className="field-input num !min-h-9 !bg-surface !py-1.5"
                    value={z.qty} onChange={e => setSizes(sizes.map((y, j) => (j === i ? { ...y, qty: e.target.value } : y)))} />
                </label>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button onClick={save} disabled={busy}>Lưu thay đổi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Admin: hủy lệnh ---------- */
function CancelOrderDialog({ o, onClose }: { o: ProductionOrder; onClose: () => void }) {
  const { data: s } = useStore();
  const act = useAction();
  const beforeCut = o.step === "cut";
  const fgQty = s.finishedTxns.filter(t => t.order === o.code).reduce((t, x) => t + x.qty, 0);
  const [reason, setReason] = useState("");
  const [returnMaterials, setReturn] = useState(beforeCut);
  const [removeFinished, setRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const r = await act("order.admin", A.cancelOrder, o.id, { reason, returnMaterials, removeFinished });
    setBusy(false);
    if (r.ok) onClose();
  };
  return (
    <Dialog open onOpenChange={x => { if (!x) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg text-bad">Hủy lệnh {o.code}?</DialogTitle>
          <DialogDescription>Lệnh không bị xóa hẳn: vẫn xem lại được trong mục «Xem lệnh đã hủy» và Lịch sử thao tác, nhưng không thao tác thêm được.</DialogDescription>
        </DialogHeader>
        <Field label="Lý do hủy (bắt buộc)" htmlFor="co-reason">
          <textarea id="co-reason" rows={2} maxLength={1000} className="field-input resize-y" placeholder="VD: Nhập nhầm sản phẩm / số lượng" value={reason} onChange={e => setReason(e.target.value)} />
        </Field>
        <label className="flex items-start gap-2 text-[13px]">
          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--brand)]" checked={returnMaterials} onChange={e => setReturn(e.target.checked)} />
          <span><b>Hoàn phụ liệu đã xuất về kho</b><br /><span className="text-muted-foreground">{beforeCut ? "Lệnh chưa cắt, nên hoàn lại." : "Lệnh đã cắt: chỉ chọn nếu phụ liệu thực tế chưa dùng."}</span></span>
        </label>
        {fgQty > 0 && (
          <label className="flex items-start gap-2 text-[13px]">
            <input type="checkbox" className="mt-0.5 size-4 accent-[var(--brand)]" checked={removeFinished} onChange={e => setRemove(e.target.checked)} />
            <span><b>Trừ {fgQty} thành phẩm đã nhập kho</b> từ lệnh này<br /><span className="text-muted-foreground">Chỉ chọn khi số đó nhập sai, hàng thực tế không có.</span></span>
          </label>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Không hủy</Button>
          <Button variant="destructive" onClick={save} disabled={busy || !reason.trim()}>Hủy lệnh</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: s, can } = useStore();
  const act = useAction();
  const actC = useConfirmAction();
  const [adminDialog, setAdminDialog] = useState<"edit" | "cancel" | null>(null);
  const o = byId(s.orders, decodeURIComponent(id));
  const now = new Date();

  if (!o) {
    return (
      <Panel title="Không tìm thấy lệnh">
        <EmptyState>
          Lệnh này không có trong dữ liệu.{" "}
          <Link href="/lenh-san-xuat" className="font-semibold text-brand hover:underline">Về danh sách lệnh</Link>
        </EmptyState>
      </Panel>
    );
  }

  const p = prodOf(s, o);
  const b = balanceOf(s, o);
  const reps = repairsOf(s, o);
  const late = isOrderLate(o, now);
  const settled = isBalanced(o, b) && b.notReturned === 0 && b.pendingQC === 0 && b.inRepair === 0;
  const isMgr = can("order.close");
  const checklist = closeChecklist(o, b);
  const ready = canClose(o, b);
  const pending = o.batches.filter(x => !x.qc);
  const lossPct = o.loss / o.qty;

  const blocks: React.ReactNode[] = [];
  if (o.cancelled) {
    blocks.push(
      <ActionBox key="cancelled" tone="warn" title={`Lệnh đã hủy ngày ${fmtD(o.cancelled.at)}`} desc={<>Bởi {o.cancelled.by}. Lý do: <b>{o.cancelled.reason}</b></>} />,
    );
  } else if (o.step === "cut") {
    blocks.push(
      <ActionBox key="prep" title="Nguyên phụ liệu cần chuẩn bị" desc={`Đã xuất kho theo định mức cho ${o.qty} cái. Chuẩn bị đủ để giao ${wsName(s, o.workshop)} cắt.`}>
        {issuedFor(s, o).length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-lg bg-surface text-[13px]">
            {issuedFor(s, o).map(x => (
              <li key={x.material!.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span><b className="num text-brand">{x.material!.code}</b> · {x.material!.name}</span>
                <b className="num whitespace-nowrap">{nf(x.qty, 2)} {x.material!.unit}</b>
              </li>
            ))}
          </ul>
        ) : <p className="text-[13px] text-muted-foreground">Không có phụ liệu xuất kho cho lệnh này.</p>}
      </ActionBox>,
      <ActionBox key="cut" title="Xưởng đã cắt xong" desc={`Chuyển sang bước may. Ghi nhận ${o.qty} cái đã gửi may cho ${wsName(s, o.workshop)}.`}>
        {can("order.cut")
          ? <Button onClick={() => actC(
              { title: "Xác nhận xưởng đã cắt xong?", confirmLabel: "Bắt đầu may",
                description: <Summary rows={[["Lệnh", o.code], ["Xưởng", wsName(s, o.workshop)], ["Gửi may", `${o.qty} cái`]]} /> },
              "order.cut", A.confirmCut, o.id,
            )}>Xác nhận đã cắt, bắt đầu may</Button>
          : <StatusPill>Kho xác nhận bước này</StatusPill>}
      </ActionBox>,
    );
  } else if (o.step !== "done") {
    if (b.notReturned > 0 && can("order.receive")) blocks.push(<ReceiveForm key={`rcv-${b.notReturned}`} o={o} max={b.notReturned} ws={wsName(s, o.workshop)} />);
    if (can("qc.save")) pending.forEach(bt => blocks.push(<QCForm key={bt.id} o={o} b={bt} />));
    else if (pending.length) blocks.push(<ActionBox key="pq" title={`${b.pendingQC} cái đang chờ QC`} desc="Team QC sẽ kiểm và nhập kết quả." />);
    if (b.notReturned > 0 && can("loss.report")) blocks.push(<LossForm key="loss" o={o} max={b.notReturned} />);
    if (o.loss && !o.lossApproved) {
      blocks.push(
        <ActionBox key="approve" tone="warn" title={`Duyệt hao hụt ${o.loss} cái${fabricFor(s, o).perUnit ? ` ≈ ${nf(o.loss * fabricFor(s, o).perUnit, 1)} ${fabricFor(s, o).unit} vải` : ""} (${pct(lossPct)})`}
          desc={lossPct > LOSS_ALLOWED ? "Vượt mức cho phép, nên trừ tiền công hoặc yêu cầu xưởng bù." : "Trong mức cho phép."}>
          {can("loss.approve") ? (
            <ConfirmButton
              label="Duyệt hao hụt"
              title={`Duyệt hao hụt ${o.code}?`}
              description={`${wsName(s, o.workshop)} báo hao hụt ${o.loss} cái (${pct(lossPct)}). ${lossPct > LOSS_ALLOWED ? "Vượt mức cho phép 2%." : "Trong mức cho phép 2%."}`}
              confirmLabel="Duyệt"
              onConfirm={() => act("loss.approve", A.approveLoss, o.id)}
            />
          ) : <StatusPill>Chỉ Quản lý kho / Phó kho được duyệt</StatusPill>}
        </ActionBox>,
      );
    }
    blocks.push(
      <ActionBox key="close" title="Xác nhận hoàn thành lệnh">
        <ul className="mb-3 flex flex-col gap-1 text-[13px]">
          {checklist.map(([okk, t]) => (
            <li key={t} className="flex items-center gap-2">
              <span className={cn("font-bold", okk ? "text-ok" : "text-bad")}>{okk ? "✓" : "✕"}</span>{t}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          <ConfirmButton
            label="Đóng lệnh"
            variant={ready ? "default" : "secondary"}
            disabled={!ready || !isMgr}
            title={`Đóng lệnh ${o.code}?`}
            description={`Giao ${o.qty} · pass ${b.pass} · loại ${b.scrap} · hao hụt ${b.loss}. Sau khi đóng không thao tác thêm được.`}
            confirmLabel="Đóng lệnh"
            onConfirm={() => act("order.close", A.closeOrder, o.id)}
          />
          {!isMgr && <StatusPill>Quản lý kho / Phó kho đóng lệnh</StatusPill>}
        </div>
      </ActionBox>,
    );
  } else {
    blocks.push(
      <ActionBox key="done" title={`Đã hoàn thành ${o.closedAt ? fmtD(o.closedAt) : ""}`}>
        <p className="text-[13px]">
          Giao <b className="num">{o.qty}</b> · pass <b className="num">{b.pass}</b> · loại <b className="num">{b.scrap}</b> · hao hụt <b className="num">{b.loss}</b>.
          Tỉ lệ pass <b className="num text-ok">{pct(b.pass / o.qty)}</b>.
        </p>
        {o.closedBy && <p className="mt-1 text-xs text-muted-foreground">Đóng bởi {o.closedBy}</p>}
      </ActionBox>,
    );
  }
  if (!blocks.length) blocks.push(<EmptyState key="none">Vai trò của bạn chỉ xem lệnh này.</EmptyState>);

  return (
    <>
      <PageHeader
        back={{ href: "/lenh-san-xuat", label: "Lệnh sản xuất" }}
        eyebrow={<span className="num">{o.code}</span>}
        title={<>{p.name} · <span className="num">{o.qty}</span> cái</>}
        desc={
          <span className="flex flex-wrap items-center gap-2">
            {wsName(s, o.workshop)} · tạo {fmtD(o.createdAt)} · dự kiến xong {fmtD(o.dueAt)}
            {o.sizes?.map(z => <StatusPill key={z.size} tone="muted"><b className="text-brand">{z.size}</b> <span className="num">{z.qty}</span></StatusPill>)}
            {late && <StatusPill tone="bad" dot>Trễ hạn</StatusPill>}
            {o.cancelled && <StatusPill tone="bad" dot>Đã hủy</StatusPill>}
          </span>
        }
        aside={can("order.admin") && !o.cancelled ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow">Admin</span>
            {o.step !== "done" && <Button size="sm" variant="secondary" onClick={() => setAdminDialog("edit")}><Pencil /> Sửa lệnh</Button>}
            <Button size="sm" variant="destructive" onClick={() => setAdminDialog("cancel")}><Trash2 /> Hủy lệnh</Button>
          </div>
        ) : undefined}
      />
      {adminDialog === "edit" && <EditOrderDialog o={o} onClose={() => setAdminDialog(null)} />}
      {adminDialog === "cancel" && <CancelOrderDialog o={o} onClose={() => setAdminDialog(null)} />}
      <StepProgress step={o.step} />

      <div className="grid grid-cols-1 items-start gap-5 min-[1000px]:grid-cols-2">
        <Panel title="Cân đối số lượng" icon={Scale}>
          <BalanceBar qty={o.qty} b={b} big />
          <BalanceLegend b={b} />
          <BalanceEquation qty={o.qty} b={b} settled={settled} />
          {!isBalanced(o, b) && <p className="mt-2 text-xs text-bad">Số liệu không cân, kiểm tra lại các đợt nhận.</p>}
          {sizeProgress(o).length > 0 && o.step !== "cut" && (
            <div className="mt-4">
              <div className="eyebrow mb-1.5">Xưởng trả theo size</div>
              <div className="overflow-hidden rounded-lg border border-line">
                <table className="w-full text-[13px]">
                  <thead className="bg-surface-low text-left text-[11px] tracking-[0.06em] text-muted-foreground uppercase">
                    <tr><th className="px-3 py-1.5">Size</th><th className="px-3 py-1.5 text-right">Đặt</th><th className="px-3 py-1.5 text-right">Đã nhận</th><th className="px-3 py-1.5 text-right">Còn thiếu</th></tr>
                  </thead>
                  <tbody>
                    {sizeProgress(o).map(z => (
                      <tr key={z.size} className="border-t border-line">
                        <td className="px-3 py-1.5 font-bold text-brand">{z.size}{p.variants?.find(v => v.size === z.size) && <span className="num ml-1.5 text-[11px] font-normal text-subtle">{p.variants.find(v => v.size === z.size)!.sku}</span>}</td>
                        <td className="num px-3 py-1.5 text-right">{z.ordered}</td>
                        <td className="num px-3 py-1.5 text-right">{z.received}</td>
                        <td className={cn("num px-3 py-1.5 text-right font-semibold", z.missing ? "text-bad" : "text-ok")}>{z.missing || "✓"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {o.batches.some(x => !x.sizes?.length) && <p className="mt-1 text-[11.5px] text-subtle">Các đợt nhận trước khi có nhận theo size không được tính vào bảng này.</p>}
            </div>
          )}
        </Panel>
        <Panel title="Thao tác" icon={Settings2}>
          <div className="flex flex-col gap-3">{blocks}</div>
        </Panel>
      </div>

      <Panel title="Các đợt trả hàng & QC" icon={PackageOpen} flush>
        <TableWrap>
          <table className="wl-table">
            <thead>
              <tr><th>Ngày nhận</th><th className="r">Nhận</th><th className="r">Pass</th><th className="r">Trả sửa</th><th className="r">Lỗi vải</th><th className="r">Hỏng</th><th>Chi tiết lỗi</th><th>Trạng thái</th></tr>
            </thead>
            <tbody>
              {o.batches.length ? o.batches.map(bt => (
                <tr key={bt.id}>
                  <td className="num">{fmtDT(bt.receivedAt)}</td>
                  <td className="r num">{bt.received}{bt.sizes?.length ? <div className="text-[11px] font-normal text-subtle">{bt.sizes.map(x => `${x.size}:${x.qty}`).join(" ")}</div> : null}</td>
                  {bt.qc ? (
                    <>
                      <td className="r num">{bt.qc.pass}</td><td className="r num">{bt.qc.sua}</td>
                      <td className="r num">{bt.qc.vai}</td><td className="r num">{bt.qc.hong}</td>
                      <td className="text-xs">{bt.qc.lines?.length ? bt.qc.lines.map((l, k) => <div key={k}><b>{l.size}</b> · {l.defect} ×{l.qty}</div>) : <span className="text-subtle">{bt.qc.sua + bt.qc.vai + bt.qc.hong ? bt.qc.defect : "Không lỗi"}</span>}</td>
                      <td><StatusPill tone="ok" dot>Đã QC</StatusPill></td>
                    </>
                  ) : (
                    <>
                      <td colSpan={5} className="text-muted-foreground">Chưa QC</td>
                      <td><StatusPill tone="info" dot>Chờ QC</StatusPill></td>
                    </>
                  )}
                </tr>
              )) : (
                <tr><td colSpan={8}><EmptyState>Chưa có đợt trả hàng nào.</EmptyState></td></tr>
              )}
            </tbody>
          </table>
        </TableWrap>
      </Panel>

      <Panel title="Phiếu trả sửa của lệnh này" icon={Wrench} flush>
        <RepairTable list={reps} />
      </Panel>

      {can("price.view") && (
        <Panel title="Giá vốn chốt khi tạo lệnh" icon={Coins}>
          <p className="text-[13px]">
            <b className="num text-brand">{vnd(o.unitCost)}/cái</b> · tổng <b className="num">{vnd(o.unitCost * o.qty)}</b>.{" "}
            <span className="text-muted-foreground">Giá phụ liệu thay đổi sau này không làm đổi số của lệnh này.</span>
          </p>
        </Panel>
      )}
    </>
  );
}
