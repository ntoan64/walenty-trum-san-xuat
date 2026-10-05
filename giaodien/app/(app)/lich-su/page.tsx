"use client";

import { useCallback, useEffect, useState } from "react";
import { History, RefreshCw } from "lucide-react";
import type { AuditEntry } from "@core";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { fmtDT, isoDateVN } from "@/lib/format";
import { Avatar } from "@/components/xf/avatar";
import { useDraft } from "@/lib/use-draft";
import { EmptyState, Field, PageHeader, Panel, StatusPill, TableWrap } from "@/components/xf/basics";

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const revive = (_k: string, v: unknown) => (typeof v === "string" && ISO.test(v) ? new Date(v) : v);

// Lịch sử: ai làm gì, lúc nào. Quản lý kho / phó kho xem của mọi người, QC chỉ xem của mình.
export default function HistoryPage() {
  const { data: s, can } = useStore();
  const all = can("audit.all");
  const [f, setF] = useDraft("history:f", () => ({ userId: "", from: isoDateVN(new Date(Date.now() - 7 * 864e5)), to: isoDateVN(new Date()), q: "" }));
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (f.userId) p.set("userId", f.userId);
    if (f.from) p.set("from", new Date(`${f.from}T00:00:00+07:00`).toISOString());
    if (f.to) p.set("to", new Date(`${f.to}T23:59:59+07:00`).toISOString());
    try {
      const r = await fetch(`/api/audit?${p}`, { cache: "no-store" });
      const j = JSON.parse(await r.text(), revive) as { rows?: AuditEntry[] };
      setRows(j.rows ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [f.userId, f.from, f.to]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- tải lại khi đổi bộ lọc
  useEffect(() => { load(); }, [load]);

  const q = f.q.trim().toLowerCase();
  const shown = (rows ?? []).filter(r => !q || `${r.label} ${r.detail} ${r.ref ?? ""}`.toLowerCase().includes(q));

  return (
    <>
      <PageHeader
        eyebrow={<>Quản trị <span className="text-subtle">/</span> <span className="text-subtle">Lịch sử</span></>}
        title="Lịch sử thao tác"
        desc={all ? "Mọi việc từng người đã làm trên hệ thống: nhập kho, tạo lệnh, QC, duyệt, đăng nhập…" : "Những việc bạn đã làm trên hệ thống."}
      />
      <Panel
        title="Nhật ký" icon={History} flush
        actions={<Button size="sm" variant="secondary" onClick={load} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} /> Làm mới</Button>}
      >
        <div className="grid grid-cols-2 gap-3 px-4 pt-3 pb-3 sm:grid-cols-4 md:px-5">
          {all && (
            <Field label="Người làm" htmlFor="h-user">
              <select id="h-user" className="field-input" value={f.userId} onChange={e => setF({ ...f, userId: e.target.value })}>
                <option value="">Tất cả</option>
                {s.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Từ ngày" htmlFor="h-from">
            <input id="h-from" type="date" className="field-input num" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} />
          </Field>
          <Field label="Đến ngày" htmlFor="h-to">
            <input id="h-to" type="date" className="field-input num" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} />
          </Field>
          <Field label="Tìm" htmlFor="h-q" className={all ? "" : "col-span-2"}>
            <input id="h-q" className="field-input" placeholder="Mã lệnh, phiếu, nội dung…" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} />
          </Field>
        </div>
        <TableWrap>
          <table className="wl-table">
            <thead><tr><th>Thời gian</th><th>Người làm</th><th>Thao tác</th><th>Chi tiết</th><th>Mã</th></tr></thead>
            <tbody>
              {rows === null ? (
                <tr><td colSpan={5}><EmptyState>Đang tải…</EmptyState></td></tr>
              ) : shown.length ? shown.map(r => {
                const u = s.users.find(x => x.id === r.userId);
                return (
                  <tr key={r.id}>
                    <td className="num whitespace-nowrap">{fmtDT(r.at)}</td>
                    <td>
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        <Avatar user={u} name={r.userName} size={26} /> {u?.name ?? r.userName}
                      </span>
                    </td>
                    <td className="whitespace-nowrap"><StatusPill tone={r.action === "login" ? "muted" : "brand"}>{r.label}</StatusPill></td>
                    <td>{r.detail}</td>
                    <td className="num whitespace-nowrap text-brand">{r.ref ?? ""}</td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={5}><EmptyState>Không có thao tác nào trong khoảng này.</EmptyState></td></tr>
              )}
            </tbody>
          </table>
        </TableWrap>
      </Panel>
    </>
  );
}
