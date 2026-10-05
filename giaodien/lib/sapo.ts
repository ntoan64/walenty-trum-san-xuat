"use client";

import type { ProductVariant } from "@core";
import type { SapoItem } from "@/lib/actions";

// Đọc file Excel "Xuất file sản phẩm" của Sapo. Cột nhận theo tên tiêu đề, không theo vị trí.
const SIZE_ATTR = /^(kích thước|size)$/i;
const COLOR_ATTR = /^màu/i;

const cellText = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (o.richText) return o.richText.map(x => x.text).join("");
    if (o.text != null) return String(o.text);
    if (o.result != null) return String(o.result);
    if (o.hyperlink) return o.hyperlink;
  }
  return String(v).trim();
};
const cellNum = (v: unknown) => {
  const n = Number(cellText(v).replace(/[^\d.-]/g, ""));
  return isFinite(n) && cellText(v) !== "" ? n : undefined;
};

// "LC_CN2_Tồn kho ban đầu*" → "CN2"
const branchOf = (h: string) => /^LC_(.+?)_/i.exec(h)?.[1] ?? h.replace(/tồn kho.*/i, "").trim();

// Bảng gốc giữ nguyên tiêu đề cột và giá trị như trong file
export type SapoCell = string | number | null;
export interface SapoSheet { columns: string[]; rows: SapoCell[][]; items: SapoItem[] }

const rawCell = (v: unknown): SapoCell => {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (v instanceof Date) return v.toISOString();
  const t = cellText(v);
  return t === "" ? null : t;
};

// Đọc sheet đầu: tự tìm dòng tiêu đề (bỏ các dòng phía trên như "Ngày xuất file", "Nhân viên xuất"),
// giữ đúng các cột từ tiêu đề đầu tiên đến cuối cùng, mỗi dòng dữ liệu giữ nguyên giá trị.
async function readSheet(file: File, required: RegExp[], notFound: string) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("File không có sheet nào");
  let hr = 0;
  for (let r = 1; r <= Math.min(30, ws.rowCount) && !hr; r++) {
    const h = (ws.getRow(r).values as unknown[]).map(cellText);
    if (required.every(re => h.some(x => re.test(x)))) hr = r;
  }
  if (!hr) throw new Error(notFound);
  const header = (ws.getRow(hr).values as unknown[]).map(cellText);
  const idx = header.map((h, i) => (i > 0 && h ? i : -1)).filter(i => i > 0);
  const first = idx[0], last = idx[idx.length - 1];
  const span = Array.from({ length: last - first + 1 }, (_, k) => first + k);
  const columns = span.map(i => header[i].trim());
  const data: { v: unknown[]; raw: SapoCell[] }[] = [];
  for (let r = hr + 1; r <= ws.rowCount; r++) {
    const v = ws.getRow(r).values as unknown[];
    const raw = span.map(i => rawCell(v[i]));
    if (raw.some(x => x !== null)) data.push({ v, raw });
  }
  return { header, columns, data };
}

// File "Danh sách chi tiết đơn đặt hàng nhập" của Sapo: chỉ giữ bảng, đúng cột
export async function parsePurchaseFile(file: File): Promise<{ columns: string[]; rows: SapoCell[][] }> {
  const { columns, data } = await readSheet(file, [/^mã đơn đặt hàng$/i, /^mã sku$/i, /^số lượng đặt$/i],
    "Không phải file đơn đặt hàng nhập của Sapo (thiếu cột Mã đơn đặt hàng / Mã SKU / Số lượng đặt)");
  return { columns, rows: data.map(d => d.raw) };
}

export async function parseSapoFile(file: File): Promise<SapoSheet> {
  const { header, columns, data } = await readSheet(file, [/^tên sản phẩm/i, /^mã sku/i],
    "Không phải file xuất sản phẩm của Sapo (thiếu cột Tên sản phẩm / Mã SKU)");
  const rows = data.map(d => d.raw);
  const col = (re: RegExp) => header.findIndex(h => re.test(h));
  const cName = col(/^tên sản phẩm/i), cType = col(/^loại sản phẩm/i), cTags = col(/^tags$/i), cBrand = col(/^nhãn hiệu$/i);
  const cSku = col(/^mã sku/i), cBarcode = col(/^barcode/i), cImg = col(/^ảnh đại diện/i);
  const cAttr = [1, 2, 3].map(i => ({ name: col(new RegExp(`^thuộc tính ${i}$`, "i")), value: col(new RegExp(`^giá trị thuộc tính ${i}$`, "i")) }));
  const cStock = header.map((h, i) => (/tồn kho/i.test(h) && !/tối/i.test(h) ? i : -1)).filter(i => i > 0);
  const cPrices = header.map((h, i) => (/^PL_/i.test(h) ? i : -1)).filter(i => i > 0);

  const items: SapoItem[] = [];
  let cur: (SapoItem & { attrNames: string[] }) | null = null;
  for (const { v } of data) {
    const name = cellText(v[cName]);
    if (name) {
      cur = {
        name,
        category: cellText(v[cType]) || undefined,
        brand: cBrand > 0 ? cellText(v[cBrand]) || undefined : undefined,
        tags: cellText(v[cTags]).split(",").map(t => t.trim()).filter(Boolean),
        variants: [],
        attrNames: cAttr.map(a => (a.name > 0 ? cellText(v[a.name]) : "")),
      };
      items.push(cur);
    }
    const sku = cellText(v[cSku]);
    if (!cur || !sku) continue;
    let size = "";
    const others: string[] = [];
    cAttr.forEach((a, i) => {
      const val = a.value > 0 ? cellText(v[a.value]) : "";
      if (!val) return;
      if (SIZE_ATTR.test(cur!.attrNames[i])) size = val;
      else if (COLOR_ATTR.test(cur!.attrNames[i])) others.unshift(val); // màu đứng trước
      else others.push(val);
    });
    const prices: Record<string, number> = {};
    for (const i of cPrices) {
      const n = cellNum(v[i]);
      const label = header[i].replace(/^PL_/i, "").trim();
      // giữ cả giá 0 (vd Giá bán buôn = 0) để hiện đủ như Sapo
      if (n !== undefined && !/^giá (bán lẻ|nhập)$/i.test(label)) prices[label] = n;
    }
    const variant: ProductVariant = {
      size: size || "F",
      color: others.join(" / ") || undefined,
      sku,
      barcode: cellText(v[cBarcode]) || undefined,
      image: cellText(v[cImg]) || undefined,
      stock: cStock.reduce((t, i) => t + (cellNum(v[i]) ?? 0), 0),
      stocks: cStock.length > 1 ? Object.fromEntries(cStock.map(i => [branchOf(header[i]), cellNum(v[i]) ?? 0])) : undefined,
      price: cellNum(v[header.findIndex(h => /^PL_Giá bán lẻ$/i.test(h))]),
      cost: cellNum(v[header.findIndex(h => /^PL_Giá nhập$/i.test(h))]),
      prices: Object.keys(prices).length ? prices : undefined,
    };
    cur.variants.push(variant);
  }
  return { columns, rows, items: items.filter(i => i.variants.length).map(({ name, category, brand, tags, variants }) => ({ name, category, brand, tags, variants })) };
}
