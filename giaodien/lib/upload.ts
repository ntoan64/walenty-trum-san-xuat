"use client";

// Thu nhỏ ảnh trên máy (cạnh dài ≤ 1600px, JPEG) rồi tải thẳng lên Cloudinary bằng chữ ký từ server
const MAX_SIDE = 1600;

async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Chỉ nhận file ảnh");
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file; // định dạng trình duyệt không đọc được (vd HEIC) → gửi nguyên, Cloudinary tự xử lý
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((ok, no) => canvas.toBlob(b => (b ? ok(b) : no(new Error("Không xử lý được ảnh"))), "image/jpeg", 0.82));
}

export async function uploadPhoto(file: File, folder: "qc" | "material" = "qc"): Promise<string> {
  if (file.size > 25 * 1024 * 1024) throw new Error("Ảnh quá lớn (tối đa 25MB)");
  const [blob, sigRes] = await Promise.all([shrink(file), fetch(`/api/upload/sign?folder=${folder}`, { method: "POST" })]);
  const sig = await sigRes.json().catch(() => ({}));
  if (!sigRes.ok) throw new Error(sig.error ?? "Không lấy được quyền tải ảnh");
  const fd = new FormData();
  fd.append("file", blob);
  fd.append("api_key", sig.apiKey);
  fd.append("timestamp", String(sig.timestamp));
  fd.append("folder", sig.folder);
  fd.append("signature", sig.signature);
  const r = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, { method: "POST", body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.secure_url) throw new Error(j.error?.message ?? "Tải ảnh thất bại");
  return j.secure_url as string;
}

// Ảnh nhỏ để hiển thị nhanh (Cloudinary tự cắt, nén, chọn định dạng)
export const thumb = (url: string, size = 160) => url.replace("/image/upload/", `/image/upload/c_fill,w_${size},h_${size},q_auto,f_auto/`);
