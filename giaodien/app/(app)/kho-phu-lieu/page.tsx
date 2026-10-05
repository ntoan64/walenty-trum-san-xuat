"use client";

import { useState } from "react";
import { Pencil, Receipt, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  byId, MATERIAL_CATEGORIES, MATERIAL_STATUS, okLevel, stockLevel, sum,
  type ItemStatus, type Material, type MaterialCategory,
} from "@core";
import { matches } from "@/lib/search";
import { SearchBox } from "@/components/xf/search-box";
import { useStore, A } from "@/lib/store";
import { useAction, useConfirmAction } from "@/lib/use-action";
import { fmtD, nf, vnd } from "@/lib/format";
import { lowMaterials } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import { Summary } from "@/components/xf/confirm-provider";
import { ImportTable } from "@/components/xf/import-table";
import { StatusSelect } from "@/components/xf/status-select";
import { useDraft } from "@/lib/use-draft";
import { EmptyState, NumberField, PageHeader, Panel, StatCard, StatusPill, TableWrap, Tag } from "@/components/xf/basics";

const CATS = Object.entries(MATERIAL_CATEGORIES) as [MaterialCategory, string][];

/* ---------- Sửa ngưỡng báo hết / báo đủ ---------- */
function ThresholdDialog({ m, onClose }: { m: Material; onClose: () => void }) {
  const act = useAction();
  const [f, setF] = useState({ min: String(m.minStock), ok: String(okLevel(m)) });
  const [busy, setBusy] = useState(false);
  const min = +f.min || 0, okv = +f.ok || 0;
  const err = okv <= min ? "Ngưỡng báo đủ phải lớn hơn ngưỡng báo hết" : null;
  const save = async () => {
    if (err) return;
    setBusy(true);
    const r = await act("material.manage", A.setThresholds, m.id, { minStock: min, okStock: okv });
    setBusy(false);
    if (r.ok) onClose();
  };
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg text-brand">Ngưỡng thông báo · {m.code}</DialogTitle>
          <DialogDescription>{m.name} · đang tồn <b className="num">{nf(m.stock, 1)} {m.unit}</b></DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <NumberField id="th-min" label={`Báo hết khi dưới (${m.unit})`} min={0} step="any" value={f.min} onChange={v => setF({ ...f, min: v })} />
          <NumberField id="th-ok" label={`Báo đủ khi từ (${m.unit})`} min={0} step="any" value={f.ok} onChange={v => setF({ ...f, ok: v })} error={err} />
        </div>
        <p className="text-xs text-muted-foreground">
          Dưới <b className="text-bad">{nf(min)}</b>: hiện Sắp hết và gửi thông báo cần nhập. Từ <b className="text-warn">{nf(min)}</b> đến dưới <b className="text-ok">{nf(okv)}</b>: Gần hết. Nhập lên từ <b className="text-ok">{nf(okv)}</b>: Đủ và gửi thông báo đã đủ hàng.
        </p>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button onClick={save} disabled={busy || !!err}>Lưu ngưỡng</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function MaterialsPage() {
  const { data: s, can } = useStore();
  const act = useConfirmAction();
  const [cat, setCat] = useDraft<"all" | MaterialCategory>("npl:cat", "all");
  const [filter, setFilter] = useDraft("npl:filter", "all");
  const total = sum(s.materials, m => m.stock * m.avgPrice);
  const low = lowMaterials(s).filter(m => m.status === "active").length;
  const [q, setQ] = useDraft("npl:q", "");
  const list = s.materials.filter(m => (cat === "all" || m.category === cat) && matches(q, m.code, m.name, MATERIAL_CATEGORIES[m.category], m.unit));
  const manage = can("material.manage");
  const hist = s.materialTxns
    .filter(t => filter === "all" || t.material === filter)
    .slice()
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 40);

  const [editing, setEditing] = useState<Material | null>(null);

  const changeStatus = (id: string, status: ItemStatus) => {
    const m = byId(s.materials, id)!;
    act(
      {
        title: `Đổi tình trạng ${m.code}?`, confirmLabel: "Đổi tình trạng",
        description: (
          <>
            <Summary rows={[["Phụ liệu", `${m.code} · ${m.name}`], ["Từ", MATERIAL_STATUS[m.status]], ["Sang", MATERIAL_STATUS[status]]]} />
            <p className="mt-2 text-xs">
              {status === "active" && "Dùng lại bình thường cho lệnh mới."}
              {status === "paused" && "Vẫn nhập kho được nhưng không dùng cho lệnh sản xuất mới."}
              {status === "discontinued" && "Không nhập thêm, không dùng cho lệnh mới. Lịch sử vẫn giữ nguyên."}
            </p>
          </>
        ),
      },
      "material.manage", A.setMaterialStatus, id, status,
    );
  };

  return (
    <>
      <PageHeader
        eyebrow={<>Phân hệ kho <span className="text-subtle">/</span> <span className="text-subtle">Nguyên phụ liệu</span></>}
        title="Kho nguyên phụ liệu"
        desc="Giá BQ = tổng tiền các lần nhập ÷ tổng số lượng các lần nhập. Xuất kho tự động theo định mức khi tạo lệnh."
        aside={
          <div className="grid w-full grid-cols-3 gap-2 min-[1500px]:w-auto">
            <StatCard className="min-[1500px]:min-w-[150px]" label="Giá trị tồn" value={<span className="text-[20px]">{vnd(total)}</span>} tone="brand" />
            <StatCard className="min-[1500px]:min-w-[110px]" label="Mã phụ liệu" value={s.materials.length} unit="mã" />
            <StatCard className="min-[1500px]:min-w-[110px]" label="Sắp hết" value={low} unit="mã" tone={low ? "alert" : "default"} />
          </div>
        }
      />
      {can("material.import") && <ImportTable />}

      <Panel
        title="Tồn kho" icon={Warehouse} flush
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <SearchBox value={q} onChange={setQ} placeholder="Tìm mã, tên phụ liệu…" label="Tìm phụ liệu" />
          <div role="group" aria-label="Lọc theo loại" className="flex max-w-full gap-1 overflow-x-auto">
            {([["all", "Tất cả"], ...CATS] as [string, string][]).map(([k, label]) => {
              const n = k === "all" ? s.materials.length : s.materials.filter(m => m.category === k).length;
              if (k !== "all" && !n) return null;
              return (
                <button key={k} type="button" aria-pressed={cat === k} onClick={() => setCat(k as typeof cat)}
                  className={cn("rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
                    cat === k ? "bg-brand text-brand-fg" : "bg-surface-2 text-muted-foreground hover:bg-surface-3")}>
                  {label} <span className="num opacity-70">{n}</span>
                </button>
              );
            })}
          </div>
          </div>
        }
      >
        <TableWrap>
          <table className="wl-table !min-w-[1000px]">
            <thead><tr><th>Mã</th><th>Tên</th><th>Loại</th><th>ĐVT</th><th className="r">Tồn</th><th className="r">Giá BQ</th><th className="r">Giá trị tồn</th><th className="r">Báo hết dưới</th><th className="r">Báo đủ từ</th><th>Mức tồn</th><th>Tình trạng</th></tr></thead>
            <tbody>
              {list.map(m => {
                const lv = stockLevel(m);
                return (
                  <tr key={m.id} className={m.status === "discontinued" ? "opacity-60" : ""}>
                    <td className="num font-bold text-brand">{m.code}</td>
                    <td className="font-medium">{m.name}</td>
                    <td className="text-brown">{MATERIAL_CATEGORIES[m.category]}</td>
                    <td>{m.unit}</td>
                    <td className={`r num font-semibold ${lv === "low" ? "text-bad" : ""}`}>{nf(m.stock, 1)}</td>
                    <td className="r num">{m.totalImportQty ? vnd(m.avgPrice) : "–"}</td>
                    <td className="r num">{vnd(m.stock * m.avgPrice)}</td>
                    <td className="r num text-bad">{nf(m.minStock)}</td>
                    <td className="r num text-ok">
                      <span className="inline-flex items-center gap-1">
                        {nf(okLevel(m))}
                        {manage && (
                          <button type="button" aria-label={`Sửa ngưỡng ${m.code}`} onClick={() => setEditing(m)}
                            className="rounded p-1 text-subtle hover:bg-surface-3 hover:text-brand"><Pencil className="size-3.5" /></button>
                        )}
                      </span>
                    </td>
                    <td>
                      {m.status === "discontinued" ? <span className="text-xs text-subtle">–</span>
                        : lv === "low" ? <StatusPill tone="bad" dot>Sắp hết</StatusPill>
                        : lv === "near" ? <StatusPill tone="warn" dot>Gần hết</StatusPill>
                        : <StatusPill tone="ok" dot>Đủ</StatusPill>}
                    </td>
                    <td>
                      <StatusSelect id={`ms-${m.id}`} value={m.status} labels={MATERIAL_STATUS} editable={manage} onChange={v => changeStatus(m.id, v)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      </Panel>

      <Panel
        title="Lịch sử nhập / xuất" icon={Receipt} flush tag={<Tag>{hist.length} dòng</Tag>}
        actions={
          <div className="w-full min-w-[200px] sm:w-auto">
            <label htmlFor="h-f" className="sr-only">Lọc theo phụ liệu</label>
            <select id="h-f" className="field-input !bg-surface" value={filter} onChange={e => setFilter(e.target.value)}>
              <option value="all">Tất cả phụ liệu</option>
              {s.materials.map(m => <option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}
            </select>
          </div>
        }
      >
        <TableWrap>
          <table className="wl-table">
            <thead><tr><th>Ngày</th><th>Mã</th><th>Loại</th><th className="r">Số lượng</th><th className="r">Đơn giá</th><th>Nhà CC / Lệnh</th><th className="r">Tồn sau</th><th className="r">Giá BQ sau</th><th>Người làm</th></tr></thead>
            <tbody>
              {hist.length ? hist.map(t => {
                const m = byId(s.materials, t.material)!;
                return (
                  <tr key={t.id}>
                    <td className="num">{fmtD(t.at)}</td>
                    <td className="num">{m.code}</td>
                    <td>{t.type === "in" ? <StatusPill tone="ok">Nhập</StatusPill> : t.type === "adjust" ? <StatusPill tone="info">Hoàn kho</StatusPill> : <StatusPill tone="muted">Xuất</StatusPill>}</td>
                    <td className="r num">{t.type === "out" ? "−" : "+"}{nf(t.qty, 2)}</td>
                    <td className="r num">{t.type === "in" ? vnd(t.price ?? 0) : ""}</td>
                    <td className={t.type === "in" ? "" : "num"}>{t.type === "in" ? t.supplier : t.order}{t.reason && <div className="font-sans text-xs text-muted-foreground">{t.reason}</div>}</td>
                    <td className="r num">{nf(t.stockAfter, 2)}</td>
                    <td className="r num">{t.type === "in" ? vnd(t.avgAfter) : ""}</td>
                    <td className="text-muted-foreground">{t.by}</td>
                  </tr>
                );
              }) : <tr><td colSpan={9}><EmptyState>Chưa có lần nhập / xuất nào.</EmptyState></td></tr>}
            </tbody>
          </table>
        </TableWrap>
      </Panel>
      {editing && <ThresholdDialog m={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
