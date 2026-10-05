"use client";

// Xuất file Excel (.xlsx) nhiều sheet ngay trên trình duyệt. Thư viện chỉ tải khi bấm nút.
export type ExcelCol = {
  header: string;
  key: string;
  width?: number;
  fmt?: "money" | "int" | "dec" | "date" | "datetime" | "pct";
};
export type ExcelSheet = { name: string; columns: ExcelCol[]; rows: Record<string, unknown>[]; note?: string };

const NUMFMT: Record<NonNullable<ExcelCol["fmt"]>, string> = {
  money: '#,##0" đ"',
  int: "#,##0",
  dec: "#,##0.##",
  date: "dd/mm/yyyy",
  datetime: "hh:mm dd/mm/yyyy",
  pct: "0.0%",
};

// Excel không có múi giờ: dời sang giờ Việt Nam để hiện đúng ngày giờ
const vnDate = (d: Date) => new Date(d.getTime() + 7 * 3600e3);

export async function exportExcel(file: string, sheets: ExcelSheet[]) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Walenty Trùm Sản Xuất";
  wb.created = new Date();

  for (const sh of sheets) {
    const ws = wb.addWorksheet(sh.name.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = sh.columns.map(c => ({ header: c.header, key: c.key, width: c.width ?? Math.max(12, c.header.length + 4) }));
    for (const r of sh.rows) {
      const row: Record<string, unknown> = {};
      for (const c of sh.columns) {
        const v = r[c.key];
        row[c.key] = v instanceof Date ? vnDate(v) : v ?? "";
      }
      ws.addRow(row);
    }
    sh.columns.forEach((c, i) => { if (c.fmt) ws.getColumn(i + 1).numFmt = NUMFMT[c.fmt]; });
    // dòng tiêu đề màu Walenty
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: "FFFFFFFF" } };
    head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5E1117" } };
    head.alignment = { vertical: "middle", wrapText: true };
    head.height = 22;
    if (sh.rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sh.columns.length } };
    if (sh.note) {
      ws.addRow([]);
      const n = ws.addRow([sh.note]);
      n.font = { italic: true, color: { argb: "FF887271" } };
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${file}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Tên file: walenty-<tên>-<ngày>
export const excelName = (name: string) => {
  const d = vnDate(new Date());
  return `walenty-${name}-${d.toISOString().slice(0, 10)}`;
};
