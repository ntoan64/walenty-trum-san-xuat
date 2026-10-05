"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Coins, PackageOpen, Plus, Scale, Settings2, Trash2, Wrench } from "lucide-react";
import {
  byId, closeChecklist, canClose, DEFECT_KIND, DEFECTS, isBalanced, knownDefects, isOrderLate, LOSS_ALLOWED, SIZES,
  type Batch, type DefectLine, type ProductionOrder,
} from "@core";
import { Button } from "@/components/ui/button";
import { useStore, A } from "@/lib/store";
import { useAction, useConfirmAction } from "@/lib/use-action";
import { Summary } from "@/components/xf/confirm-provider";
import { fmtD, fmtDT, nf, pct, vnd } from "@/lib/format";
import { prodOf, repairsOf, wsName } from "@/lib/actions";
import { balanceOf, fabricFor, issuedFor } from "@/lib/selectors";
import { EmptyState, NumberField, PageHeader, Panel, StatusPill, TableWrap } from "@/components/xf/basics";
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
  const sizes = o.sizes?.map(x => x.size) ?? [];
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
      title={`QC đợt nhận ${fmtDT(b.receivedAt)} · ${b.received} cái`}
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

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: s, can } = useStore();
  const act = useAction();
  const actC = useConfirmAction();
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
  if (o.step === "cut") {
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
          </span>
        }
      />
      <StepProgress step={o.step} />

      <div className="grid grid-cols-1 items-start gap-5 min-[1000px]:grid-cols-2">
        <Panel title="Cân đối số lượng" icon={Scale}>
          <BalanceBar qty={o.qty} b={b} big />
          <BalanceLegend b={b} />
          <BalanceEquation qty={o.qty} b={b} settled={settled} />
          {!isBalanced(o, b) && <p className="mt-2 text-xs text-bad">Số liệu không cân, kiểm tra lại các đợt nhận.</p>}
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
                  <td className="r num">{bt.received}</td>
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
