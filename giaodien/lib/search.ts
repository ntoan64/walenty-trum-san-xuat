// Tìm kiếm không phân biệt dấu / hoa thường: "ao so mi" khớp "Áo sơ mi"
export const norm = (s: unknown) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();

// Mọi từ trong ô tìm đều phải có trong ít nhất một trường
export function matches(q: string, ...fields: unknown[]) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fields.map(norm).join(" ");
  return words.every(w => hay.includes(w));
}
