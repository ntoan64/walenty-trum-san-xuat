"use client";

import { useState } from "react";
import { ClipboardList, Pencil, Trash2, Receipt, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  byId, materialForecast, MATERIAL_CATEGORIES, MATERIAL_STATUS, okLevel, stockLevel, sum,
  type ItemStatus, type Material, type MaterialCategory, type MaterialTxn,
} from "@core";
import { matches } from "@/lib/search";
import { SearchBox } from "@/components/xf/search-box";
import { useStore, A } from "@/lib/store";
import { useAskAction, useConfirmAction } from "@/lib/use-action";
import { fmtD, nf, vnd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Summary } from "@/components/xf/confirm-provider";
import { PhotoPicker, PhotoStrip } from "@/components/xf/photos";
import { ImportTable } from "@/components/xf/import-table";
import { StatusSelect } from "@/components/xf/status-select";
import { useDraft } from "@/lib/use-draft";
import { ExportButton } from "@/components/xf/export-button";
import { EmptyState, Field, PageHeader, Panel, StatCard, StatusPill, TableWrap, Tag } from "@/components/xf/basics";
import { SearchPicker } from "@/components/xf/search-picker";
import { EditDialog, toNum } from "@/components/xf/edit-dialog";

const CATS = Object.entries(MATERIAL_CATEGORIES) as [MaterialCategory, string][];

/* ---------- Sửa phụ liệu: mã, tên, đơn vị, loại ---------- */
function EditMaterialDialog({ m, onClose }: { m: Material; onClose: () => void }) {
  const act = useAskAction();
  const [f, setF] = useState({ code: m.code, name: m.name, unit: m.unit, category: m.category });
  const [busy, setBusy] = useState(false);
  const [img, setImg] = useState<string[]>(m.image ? [m.image] : []);
  const [st, setSt] = useState({ stock: String(m.stock), avg: String(Math.round(m.avgPrice)), reason: "" });
  const confirm = useConfirmAction();
  const save = async () => {
    setBusy(true);
    if ((img[0] ?? "") !== (m.image ?? "")) await act("material.manage", A.setMaterialImage, m.id, img[0] ?? null);
    const stock = Number(st.stock.replace(",", ".")), avg = Number(st.avg.replace(/[.,\s]/g, ""));
    if (stock !== m.stock || avg !== Math.round(m.avgPrice)) {
      const r0 = await act("material.manage", A.adjustMaterial, m.id, { stock, avgPrice: avg, reason: st.reason });
      if (!r0.ok) { setBusy(false); return; }
    }
    const changed = f.code !== m.code || f.name !== m.name || f.unit !== m.unit || f.category !== m.category;
    const r = changed ? await act("material.manage", A.updateMaterial, m.id, f) : { ok: true };
    setBusy(false);
    if (r.ok) onClose();
  };
  const remove = async () => {
    const r = await confirm({ title: `Xóa ${m.code}?`, confirmLabel: "Xóa", description: <Summary rows={[["Phụ liệu", m.name], ["Đang tồn", `${nf(m.stock, 2)} ${m.unit}`], ["Lưu ý", "Xóa luôn lịch sử nhập / xuất của phụ liệu này"]]} /> }, "material.manage", A.deleteMaterial, m.id);
    if (r?.ok) onClose();
  };
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg text-brand">Sửa phụ liệu · {m.code}</DialogTitle>
          <DialogDescription>Đang tồn <b className="num">{nf(m.stock, 1)} {m.unit}</b>. Đổi mã không ảnh hưởng lịch sử nhập / xuất.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mã" htmlFor="em-code">
            <input id="em-code" className="field-input num uppercase" maxLength={20} value={f.code} onChange={e => setF({ ...f, code: e.target.value })} />
          </Field>
          <Field label="Loại" htmlFor="em-cat">
            <select id="em-cat" className="field-input" value={f.category} onChange={e => setF({ ...f, category: e.target.value as MaterialCategory })}>
              {CATS.map(([k, lb]) => <option key={k} value={k}>{lb}</option>)}
            </select>
          </Field>
          <div className="col-span-2">
            <Field label="Tên phụ liệu" htmlFor="em-name">
              <input id="em-name" className="field-input" maxLength={120} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
            </Field>
          </div>
          <Field label="Đơn vị tính" htmlFor="em-unit">
            <input id="em-unit" className="field-input" maxLength={20} value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })} />
          </Field>
          <div>
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Ảnh</span>
            <PhotoPicker label={`Ảnh ${m.code}`} folder="material" max={1} value={img} onChange={setImg} />
          </div>
          <Field label={`Tồn kho (${m.unit || "đơn vị"})`} htmlFor="em-stock">
            <input id="em-stock" inputMode="decimal" className="field-input num" value={st.stock} onChange={e => setSt({ ...st, stock: e.target.value })} />
          </Field>
          <Field label="Giá BQ (đ)" htmlFor="em-avg">
            <input id="em-avg" inputMode="numeric" className="field-input num" value={st.avg} onChange={e => setSt({ ...st, avg: e.target.value })} />
          </Field>
          <div className="col-span-2">
            <Field label="Lý do sửa tồn / giá (không bắt buộc)" htmlFor="em-reason">
              <input id="em-reason" className="field-input" maxLength={200} placeholder="VD: kiểm kê, nhập sai" value={st.reason} onChange={e => setSt({ ...st, reason: e.target.value })} />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="destructive" className="sm:mr-auto" onClick={remove} disabled={busy}>Xóa phụ liệu</Button>
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button onClick={save} disabled={busy}>Lưu</Button>
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
  const live = s.materials.filter(m => m.status !== "discontinued");
  const out = live.filter(m => stockLevel(m) === "out").length;
  const low = live.filter(m => stockLevel(m) === "low").length;
  const [q, setQ] = useDraft("npl:q", "");
  const list = s.materials.filter(m => (cat === "all" || m.category === cat) && matches(q, m.code, m.name, MATERIAL_CATEGORIES[m.category], m.unit, m.supplier, m.supplierCode, m.note));
  const manage = can("material.manage");
  // tổng định mức các lệnh chưa xuất phụ liệu (không tách xưởng)
  const forecast = materialForecast(s.products, s.materials, s.orders, s.materialTxns);
  const shortN = forecast.filter(x => x.short > 0).length;
  const hist = s.materialTxns
    .filter(t => filter === "all" || t.material === filter)
    .slice()
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 40);

  const [editing, setEditing] = useState<Material | null>(null);
  const [editTxn, setEditTxn] = useState<MaterialTxn | null>(null);
  const askAct = useAskAction();
  const confirmDel = useConfirmAction();

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
        desc="Giá BQ sau mỗi lần nhập = (tồn × giá BQ cũ + số nhập × giá nhập) ÷ (tồn + số nhập). Xuất kho không đổi giá BQ."
        aside={
          <div className="grid w-full grid-cols-3 gap-2 min-[1500px]:w-auto">
            <StatCard className="min-[1500px]:min-w-[150px]" label="Giá trị tồn" value={<span className="text-[20px]">{vnd(total)}</span>} tone="brand" />
            <StatCard className="min-[1500px]:min-w-[110px]" label="Mã phụ liệu" value={s.materials.length} unit="mã" />
            <StatCard className="min-[1500px]:min-w-[110px]" label="Hết / sắp hết" value={<><span className="text-bad">{out}</span> / <span className="text-warn">{low}</span></>} unit="mã" tone={out ? "alert" : "default"} />
          </div>
        }
      />
      <div className="flex justify-end">
        <ExportButton name="kho-phu-lieu" build={() => [
          { name: "Tồn kho",
            columns: [{ header: "Mã", key: "code" }, { header: "Tên", key: "name", width: 26 }, { header: "Loại", key: "cat" }, { header: "ĐVT", key: "unit" }, { header: "Tồn", key: "stock", fmt: "dec" }, { header: "Giá BQ", key: "avg", fmt: "money" }, { header: "Giá trị tồn", key: "value", fmt: "money" }, { header: "Báo hết dưới", key: "min", fmt: "dec" }, { header: "Báo đủ từ", key: "ok", fmt: "dec" }, { header: "Tình trạng", key: "status" }],
            rows: s.materials.map(m => ({ code: m.code, name: m.name, cat: MATERIAL_CATEGORIES[m.category], unit: m.unit, stock: m.stock, avg: m.avgPrice, value: m.stock * m.avgPrice, min: m.minStock, ok: okLevel(m), status: MATERIAL_STATUS[m.status] })) },
          { name: "Lịch sử nhập xuất",
            columns: [{ header: "Ngày giờ", key: "at", fmt: "datetime", width: 18 }, { header: "Mã", key: "code" }, { header: "Phụ liệu", key: "name", width: 24 }, { header: "Loại", key: "type" }, { header: "Số lượng", key: "qty", fmt: "dec" }, { header: "Đơn giá", key: "price", fmt: "money" }, { header: "Thành tiền", key: "money", fmt: "money" }, { header: "Nhà CC / Lệnh", key: "ref", width: 20 }, { header: "Ghi chú", key: "reason", width: 28 }, { header: "Tồn sau", key: "after", fmt: "dec" }, { header: "Người làm", key: "by" }],
            rows: s.materialTxns.slice().sort((a, b) => b.at.getTime() - a.at.getTime()).map(t => { const m = byId(s.materials, t.material); return { at: t.at, code: m?.code, name: m?.name, type: t.type === "in" ? "Nhập" : t.type === "adjust" ? (t.reason?.startsWith("Sửa tay") ? "Sửa tay" : "Hoàn kho") : "Xuất", qty: t.type === "out" ? -t.qty : t.qty, price: t.type === "in" ? t.price : "", money: t.type === "in" ? t.qty * (t.price ?? 0) : "", ref: t.type === "in" ? t.supplier : t.order, reason: t.reason, after: t.stockAfter, by: t.by }; }) },
        ]} />
      </div>
      {can("material.import") && <ImportTable />}

      {forecast.length > 0 && (
        <Panel title="Cần chuẩn bị cho lệnh chưa xuất" icon={ClipboardList} flush
          tag={shortN ? <StatusPill tone="bad" dot>Thiếu {shortN} mã</StatusPill> : <StatusPill tone="ok" dot>Đủ</StatusPill>}>
          <TableWrap>
            <table className="wl-table">
              <thead><tr><th>Mã</th><th>Tên</th><th className="r">Cần theo định mức</th><th className="r">Tồn</th><th className="r">Đang thiếu</th></tr></thead>
              <tbody>
                {forecast.map(({ material: m, need, short }) => (
                  <tr key={m.id}>
                    <td className="num font-bold text-brand">{m.code}</td>
                    <td>{m.name}</td>
                    <td className="r num">{nf(need, 2)} {m.unit}</td>
                    <td className="r num">{nf(m.stock, 2)}</td>
                    <td className={`r num font-semibold ${short > 0 ? "text-bad" : "text-ok"}`}>{short > 0 ? `${nf(short, 2)} ${m.unit}` : "Đủ"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Panel>
      )}

      <Panel
        title="Tồn kho" icon={Warehouse} flush
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <SearchBox options={s.materials.map(m => `${m.code} ${m.name}`)} value={q} onChange={setQ} placeholder="Tìm mã, tên phụ liệu…" label="Tìm phụ liệu" />
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
            <thead><tr><th className="w-12">Ảnh</th><th>Mã</th><th>Tên</th><th>Loại</th><th>ĐVT</th><th className="r">Tồn</th><th className="r">Giá BQ</th><th className="r">Giá trị tồn</th><th>Mức tồn</th><th>Tình trạng</th></tr></thead>
            <tbody>
              {list.map(m => {
                const lv = stockLevel(m);
                return (
                  <tr key={m.id} className={m.status === "discontinued" ? "opacity-60" : ""}>
                    <td className="!py-1.5">{m.image ? <PhotoStrip photos={[m.image]} size={36} /> : <span className="block size-9 rounded-md bg-surface-2" />}</td>
                    <td className="num font-bold whitespace-nowrap text-brand">
                      {m.code}
                      {manage && (
                        <button type="button" aria-label={`Sửa ${m.code}`} onClick={() => setEditing(m)}
                          className="ml-1 rounded p-1 align-middle text-subtle hover:bg-surface-3 hover:text-brand"><Pencil className="size-3.5" /></button>
                      )}
                    </td>
                    <td className="font-medium">{m.name}{(m.supplier || m.supplierCode) && <div className="text-[11.5px] font-normal text-subtle" title={m.note}>{[m.supplier, m.supplierCode].filter(Boolean).join(" · ")}</div>}</td>
                    <td className="text-brown">{MATERIAL_CATEGORIES[m.category]}</td>
                    <td>{m.unit}</td>
                    <td className={`r num font-semibold ${lv === "out" ? "text-bad" : lv === "low" ? "text-warn" : ""}`}>{nf(m.stock, 1)}</td>
                    <td className="r num">{m.avgPrice ? vnd(m.avgPrice) : "–"}</td>
                    <td className="r num">{vnd(m.stock * m.avgPrice)}</td>
                    <td>
                      {m.status === "discontinued" ? <span className="text-xs text-subtle">–</span>
                        : lv === "out" ? <StatusPill tone="bad" dot>Đã hết</StatusPill>
                        : lv === "low" ? <StatusPill tone="warn" dot>Sắp hết</StatusPill>
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
            <SearchPicker id="h-f" label="Lọc theo phụ liệu" placeholder="Tất cả phụ liệu — gõ để lọc…" value={filter === "all" ? undefined : filter} onPick={setFilter}
              items={[{ id: "all", label: "Tất cả phụ liệu" }, ...s.materials.map(m => ({ id: m.id, label: `${m.code} · ${m.name}` }))]} />
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
                    <td>{t.type === "in" ? <StatusPill tone="ok">Nhập</StatusPill> : t.type === "adjust" ? <StatusPill tone="info">{t.reason?.startsWith("Sửa tay") ? "Sửa tay" : "Hoàn kho"}</StatusPill> : <StatusPill tone="muted">Xuất</StatusPill>}</td>
                    <td className="r num">{t.type === "out" || t.qty < 0 ? "−" : "+"}{nf(Math.abs(t.qty), 2)}</td>
                    <td className="r num whitespace-nowrap">{t.type === "in" ? vnd(t.price ?? 0) : ""}
                      {t.type === "in" && manage && <button type="button" aria-label="Sửa dòng nhập" onClick={() => setEditTxn(t)}
                        className="ml-1 rounded p-1 align-middle text-subtle hover:bg-surface-3 hover:text-brand"><Pencil className="size-3.5" /></button>}
                      {t.type === "in" && manage && <button type="button" aria-label="Xóa dòng nhập" onClick={() => confirmDel({ title: `Xóa dòng nhập ${m.code}?`, confirmLabel: "Xóa", description: <Summary rows={[["Ngày", fmtD(t.at)], ["Số lượng", `${nf(t.qty, 2)} ${m.unit} × ${vnd(t.price ?? 0)}`], ["Sau khi xóa", "Trừ lại tồn, tính lại giá BQ"]]} /> }, "material.manage", A.deleteImport, t.id)}
                        className="ml-0.5 rounded p-1 align-middle text-subtle hover:bg-bad/10 hover:text-bad"><Trash2 className="size-3.5" /></button>}</td>
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
      {editing && <EditMaterialDialog m={editing} onClose={() => setEditing(null)} />}
      {editTxn && <EditDialog title={`Sửa phiếu nhập · ${byId(s.materials, editTxn.material)?.code}`}
        desc={<>Nhập ngày {fmtD(editTxn.at)} từ {editTxn.supplier}. Tồn và giá BQ sẽ tính lại theo chênh lệch.</>}
        fields={[{ key: "qty", label: `Số lượng (${byId(s.materials, editTxn.material)?.unit ?? ""})`, type: "number" }, { key: "price", label: "Đơn giá (đ)", type: "number" }]}
        initial={{ qty: String(editTxn.qty), price: String(editTxn.price ?? 0) }}
        onSave={async v => !!(await askAct("material.manage", A.editImport, editTxn.id, { qty: toNum(v.qty), price: toNum(v.price) }))?.ok}
        onClose={() => setEditTxn(null)} />}
    </>
  );
}
