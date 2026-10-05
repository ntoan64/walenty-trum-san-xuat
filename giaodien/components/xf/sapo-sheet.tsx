"use client";

import { useEffect, useRef, useState } from "react";
import { FileSpreadsheet, Loader2, Table2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useStore, A } from "@/lib/store";
import { useAction } from "@/lib/use-action";
import { matches } from "@/lib/search";
import { fmtDT, nf } from "@/lib/format";
import { parsePurchaseFile, parseSapoFile, type SapoCell } from "@/lib/sapo";
import { exportExcel, excelName } from "@/lib/excel";
import { useConfirm, Summary } from "./confirm-provider";
import { EmptyState, Panel } from "./basics";
import { SearchBox } from "./search-box";
import { PurchaseOrders } from "./sapo-purchase";

type Sheet = { columns: string[]; rows: SapoCell[][]; fileName: string; importedAt: string; by: string; version: number };
type Kind = "products" | "purchase";

// Giữ bảng đã tải trong bộ nhớ, chỉ tải lại khi có file mới (version đổi)
const cached: Record<Kind, Sheet | null> = { products: null, purchase: null };

async function loadSheet(kind: Kind): Promise<Sheet | null> {
  const c = cached[kind];
  const r = await fetch(`/api/sapo?kind=${kind}${c ? `&v=${c.version}` : ""}`, { cache: "no-store" });
  if (!r.ok) return c;
  const j = await r.json();
  if (j.same) return c;
  cached[kind] = j.sheet ?? null;
  return cached[kind];
}

// Cấu hình từng loại file Sapo
const CONF: Record<Kind, { title: string; button: string; empty: string; group: RegExp; search: string; exportName: string; sheetName: string }> = {
  products: {
    title: "Danh sách sản phẩm (đúng file Sapo)", button: "Nhập file Sapo", group: /^tên sản phẩm/i,
    empty: "Chưa có bảng. Vào Sapo → Sản phẩm → Xuất file, rồi bấm “Nhập file Sapo”.",
    search: "Tìm tên, SKU, màu, size…", exportName: "san-pham-sapo", sheetName: "Xuất file sản phẩm",
  },
  purchase: {
    title: "Đơn đặt hàng nhập (đúng file Sapo)", button: "Nhập file đơn đặt hàng", group: /^mã đơn đặt hàng$/i,
    empty: "Chưa có bảng. Vào Sapo → Đơn đặt hàng nhập → Xuất file (chi tiết), rồi bấm “Nhập file đơn đặt hàng”.",
    search: "Tìm mã đơn, xưởng, SKU, trạng thái…", exportName: "don-dat-hang-nhap-sapo", sheetName: "Đơn đặt hàng nhập",
  },
};

// Đọc bảng Sapo ở trang khác (vd Thống kê), dùng chung bộ nhớ đệm
export function useSapoSheet(kind: Kind) {
  const [sheet, setSheet] = useState<Sheet | null>(cached[kind]);
  useEffect(() => {
    let alive = true;
    loadSheet(kind).then(x => { if (alive) setSheet(x); }).catch(() => {});
    return () => { alive = false; };
  }, [kind]);
  return sheet;
}

const PAGE = 50;
const show = (x: SapoCell) => (x == null ? "" : typeof x === "number" ? nf(x, 4) : x);

// Bảng đúng như file Excel xuất của Sapo: đủ cột, đúng thứ tự, đúng giá trị
export function SapoSheetPanel({ kind = "products" }: { kind?: Kind }) {
  const cf = CONF[kind];
  const { data: s } = useStore();
  const act = useAction();
  const ask = useConfirm();
  const [sheet, setSheet] = useState<Sheet | null>(cached[kind]);
  const [loading, setLoading] = useState(!cached[kind]);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  // mặc định xem dạng gọn; "Bảng gốc" = đúng cột, đúng dòng như file Excel
  const [raw, setRaw] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    loadSheet(kind).then(x => { if (alive) { setSheet(x); setLoading(false); } }).catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [kind]);

  // dòng con (phiên bản / dòng hàng của đơn) kế thừa nội dung dòng đầu nhóm
  // → tìm theo tên sản phẩm / mã đơn / xưởng vẫn ra đủ các dòng của nhóm đó
  const groupCol = sheet ? sheet.columns.findIndex(c => cf.group.test(c)) : -1;
  const rows = (() => {
    if (!sheet) return [] as { r: SapoCell[]; i: number }[];
    let head: SapoCell[] = [];
    return sheet.rows.map((r, i) => {
      if (groupCol >= 0 && r[groupCol] != null) head = r;
      return { r, i, head };
    }).filter(x => matches(q, ...x.head, ...x.r));
  })();

  const pick = async (file?: File) => {
    if (!file) return;
    setBusy("Đang đọc file…");
    let parsed: { columns: string[]; rows: SapoCell[][]; items?: Awaited<ReturnType<typeof parseSapoFile>>["items"] };
    try { parsed = kind === "products" ? await parseSapoFile(file) : await parsePurchaseFile(file); }
    catch (e) { setBusy(null); toast.error((e as Error).message || "Không đọc được file"); return; }
    setBusy(null);
    const items = parsed.items ?? [];
    const known = new Set(s.products.flatMap(p => (p.variants ?? []).map(v => v.sku)));
    const upd = items.filter(i => i.variants.some(v => known.has(v.sku))).length;
    const ok = await ask({
      title: kind === "products" ? "Nhập file sản phẩm Sapo?" : "Nhập file đơn đặt hàng nhập Sapo?", confirmLabel: "Nhập vào web",
      description: (
        <>
          <Summary rows={[
            ["File", file.name], ["Số cột", `${parsed.columns.length}`], ["Số dòng", nf(parsed.rows.length)],
            ...(kind === "products" ? [["Số mẫu", `${items.length} (mới ${items.length - upd}, cập nhật ${upd})`] as [string, string]] : []),
          ]} />
          <p className="mt-2 text-xs">Bảng được lưu nguyên như file (đúng cột, đúng giá trị), thay cho bảng nhập lần trước.{kind === "products" && " Sản phẩm cũng được tạo / cập nhật để dùng cho lệnh sản xuất; định mức đã khai báo giữ nguyên."}</p>
        </>
      ),
    });
    if (!ok) return;
    try {
      // 1) bảng gốc
      for (let i = 0; i < parsed.rows.length || i === 0; i += 400) {
        setBusy(`Đang lưu bảng ${Math.min(i + 400, parsed.rows.length)}/${parsed.rows.length} dòng…`);
        const r = await fetch("/api/sapo", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, columns: parsed.columns, rows: parsed.rows.slice(i, i + 400), start: i, done: i + 400 >= parsed.rows.length, fileName: file.name }),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Lưu bảng thất bại");
        if (i + 400 >= parsed.rows.length) break;
      }
      // 2) sản phẩm cho lệnh sản xuất
      for (let i = 0; i < items.length; i += 25) {
        setBusy(`Đang đồng bộ sản phẩm ${Math.min(i + 25, items.length)}/${items.length}…`);
        const r = await act("product.manage", A.importSapo, items.slice(i, i + 25));
        if (!r.ok) throw new Error(r.error);
      }
      setSheet(await loadSheet(kind));
      setLimit(PAGE);
      toast.success(`Đã nhập ${nf(parsed.rows.length)} dòng từ ${file.name}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const exportSheet = async () => {
    if (!sheet) return;
    setBusy("Đang xuất…");
    try {
      await exportExcel(excelName(cf.exportName), [{
        name: cf.sheetName,
        columns: sheet.columns.map((h, i) => ({ header: h, key: `c${i}`, width: Math.min(40, Math.max(12, h.length + 2)) })),
        rows: sheet.rows.map(r => Object.fromEntries(r.map((x, i) => [`c${i}`, x]))),
      }]);
    } finally { setBusy(null); }
  };

  return (
    <Panel
      title={cf.title} icon={FileSpreadsheet} flush
      tag={sheet ? <span className="num text-xs text-subtle">{nf(rows.length)} / {nf(sheet.rows.length)} dòng</span> : undefined}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {sheet && (raw || kind === "purchase") && <SearchBox value={q} onChange={v => { setQ(v); setLimit(PAGE); }} placeholder={cf.search} label="Tìm trong bảng Sapo" />}
          <input ref={fileRef} type="file" accept=".xlsx" className="sr-only" onChange={e => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={!!busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Upload />} {busy ?? cf.button}
          </Button>
          {sheet && (
            <Button variant={raw ? "default" : "secondary"} onClick={() => setRaw(!raw)} aria-pressed={raw} title="Xem đúng cột, đúng dòng như file Excel">
              <Table2 /> {raw ? "Đang xem bảng gốc" : "Bảng gốc"}
            </Button>
          )}
          {sheet && <Button variant="secondary" onClick={exportSheet} disabled={!!busy}><FileSpreadsheet /> Xuất Excel</Button>}
        </div>
      }
    >
      {loading ? <EmptyState>Đang tải bảng…</EmptyState> : !sheet ? (
        <EmptyState>{cf.empty}</EmptyState>
      ) : (
        <>
          <p className="px-4 pt-3 text-xs text-muted-foreground md:px-5">
            File <b>{sheet.fileName}</b> · nhập lúc {fmtDT(new Date(sheet.importedAt))} bởi {sheet.by} · {sheet.columns.length} cột, {nf(sheet.rows.length)} dòng
            {!raw && kind === "products" && <> · đã đồng bộ vào <b className="text-fg">Danh sách sản phẩm</b> bên dưới (ảnh, phiên bản, tồn, đủ bảng giá)</>}
          </p>
          {!raw && kind === "purchase" ? <PurchaseOrders columns={sheet.columns} rows={sheet.rows} q={q} products={s.products} />
          : !raw ? null : <>
          <div className="mt-2 max-h-[560px] overflow-auto border-t border-line">
            <table className="w-max min-w-full border-collapse text-[12.5px]">
              <thead className="sticky top-0 z-10 bg-surface-3">
                <tr>
                  <th className="sticky left-0 z-20 bg-surface-3 px-2 py-2 text-left text-[11px] font-semibold text-muted-foreground">#</th>
                  {sheet.columns.map((c, i) => (
                    <th key={i} className="px-2.5 py-2 text-left text-[11px] font-semibold whitespace-nowrap text-muted-foreground">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map(({ r, i }) => (
                  <tr key={i} className="border-t border-line hover:bg-surface-2">
                    <td className="num sticky left-0 bg-surface px-2 py-1.5 text-[11px] text-subtle">{i + 1}</td>
                    {sheet.columns.map((_, j) => (
                      <td key={j} title={r[j] == null ? "" : String(r[j])} className="max-w-[260px] truncate px-2.5 py-1.5 whitespace-nowrap">{show(r[j])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > limit && (
            <div className="flex justify-center border-t border-line p-3">
              <Button variant="secondary" size="sm" onClick={() => setLimit(limit + PAGE)}>Xem thêm {Math.min(PAGE, rows.length - limit)} dòng</Button>
            </div>
          )}
          </>}
          {!raw && kind === "products" && <div className="h-3" />}
        </>
      )}
    </Panel>
  );
}
