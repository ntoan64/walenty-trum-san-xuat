"use client";

import { useEffect, useState } from "react";
import { DatabaseBackup, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fmtDT } from "@/lib/format";
import { useConfirm } from "./confirm-provider";
import { EmptyState, Panel } from "./basics";

type Item = { public_id: string; bytes: number; created_at: string };

async function fetchList(): Promise<{ list?: Item[]; error?: string }> {
  const r = await fetch("/api/backup", { cache: "no-store" }).catch(() => null);
  const j = await r?.json().catch(() => ({}));
  return r?.ok ? { list: j.list } : { error: j?.error ?? "Không tải được danh sách" };
}

// Sao lưu dữ liệu: tự động 1h sáng mỗi ngày, giữ 30 ngày; admin bấm sao lưu ngay hoặc tải bản về máy
export function BackupPanel() {
  const ask = useConfirm();
  const [list, setList] = useState<Item[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = (x: { list?: Item[]; error?: string }) => { if (x.list) { setList(x.list); setErr(null); } else setErr(x.error ?? "Không tải được danh sách"); };
  const load = async () => apply(await fetchList());
  useEffect(() => {
    let alive = true;
    fetchList().then(x => { if (alive) apply(x); });
    return () => { alive = false; };
  }, []);

  const now = async () => {
    if (!(await ask({ title: "Sao lưu dữ liệu ngay?", confirmLabel: "Sao lưu", description: "Tạo 1 bản sao lưu toàn bộ dữ liệu hiện tại (riêng tư, chỉ admin tải được)." }))) return;
    setBusy(true);
    try {
      const r = await fetch("/api/backup", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Sao lưu thất bại");
      toast.success("Đã sao lưu");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Sao lưu dữ liệu" icon={DatabaseBackup}
      hint="Tự động sao lưu lúc 1h sáng mỗi ngày, giữ 30 ngày gần nhất. File riêng tư, chỉ admin tải được."
      actions={<Button variant="secondary" onClick={now} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <DatabaseBackup />} Sao lưu ngay</Button>}
    >
      {err ? <EmptyState>{err}</EmptyState> : !list ? <EmptyState>Đang tải…</EmptyState> : !list.length ? <EmptyState>Chưa có bản sao lưu nào.</EmptyState> : (
        <ul className="flex flex-col divide-y divide-line">
          {list.slice(0, 10).map((b, i) => (
            <li key={b.public_id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
              <span>
                {fmtDT(new Date(b.created_at))}
                {i === 0 && <span className="ml-2 text-xs text-ok">mới nhất</span>}
                <span className="ml-2 text-xs text-subtle">{Math.max(1, Math.round(b.bytes / 1024))} KB</span>
              </span>
              <a href={`/api/backup?id=${encodeURIComponent(b.public_id)}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
                <Download className="size-3.5" /> Tải về
              </a>
            </li>
          ))}
          {list.length > 10 && <li className="pt-2 text-xs text-subtle">… và {list.length - 10} bản cũ hơn</li>}
        </ul>
      )}
    </Panel>
  );
}
