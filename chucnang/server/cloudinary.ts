// Cloudinary: ký tải ảnh (trình duyệt gửi thẳng, secret chỉ ở server) + lưu file sao lưu riêng tư.
import { createHash } from "node:crypto";
import { loadEnv } from "./db";

export function cloudConfig() {
  loadEnv();
  const m = /^cloudinary:\/\/(\w+):([\w-]+)@([\w-]+)$/.exec(process.env.CLOUDINARY_URL?.trim() ?? "");
  return m ? { apiKey: m[1], secret: m[2], cloudName: m[3] } : null;
}

// chữ ký Cloudinary: tham số sắp theo chữ cái, nối "k=v&…" + secret, SHA-1
export function sign(params: Record<string, string | number>, secret: string) {
  const s = Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("&");
  return createHash("sha1").update(s + secret).digest("hex");
}

export const FOLDERS = { qc: "walenty/qc" } as const;

export function signUpload(folder: keyof typeof FOLDERS) {
  const c = cloudConfig();
  if (!c) return null;
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { folder: FOLDERS[folder], timestamp };
  return { cloudName: c.cloudName, apiKey: c.apiKey, folder: params.folder, timestamp, signature: sign(params, c.secret) };
}
