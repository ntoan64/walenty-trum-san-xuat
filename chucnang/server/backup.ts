// Sao lưu toàn bộ dữ liệu: mỗi ngày 1 bản (cron) + bấm tay. Lưu file .json.gz RIÊNG TƯ trên Cloudinary
// (type "authenticated": không ai xem được nếu không có link ký), giữ 30 ngày gần nhất.
import { gzipSync, gunzipSync } from "node:zlib";
import { BSON, type Document } from "mongodb";
import { getDb } from "./db";
import { cloudConfig, sign } from "./cloudinary";

const FOLDER = "walenty/backup";
const KEEP_DAYS = 30;
// không sao lưu phiên đăng nhập / mã liên kết tạm
const SKIP = new Set(["sessions", "tg_links"]);

export async function dumpAll() {
  const db = await getDb();
  const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map(c => c.name).filter(n => !SKIP.has(n) && !n.startsWith("system."));
  const collections: Record<string, Document[]> = {};
  for (const n of names.sort()) collections[n] = await db.collection(n).find().toArray();
  // EJSON giữ đúng kiểu Date / số để khôi phục chính xác
  const json = BSON.EJSON.stringify({ db: db.databaseName, at: new Date(), collections }, { relaxed: false });
  return { gz: gzipSync(json), counts: Object.fromEntries(Object.entries(collections).map(([k, v]) => [k, v.length])) };
}

export function parseBackup(gz: Buffer) {
  return BSON.EJSON.parse(gunzipSync(gz).toString("utf8"), { relaxed: false }) as { db: string; at: Date; collections: Record<string, Document[]> };
}

const auth = (c: NonNullable<ReturnType<typeof cloudConfig>>) => "Basic " + Buffer.from(`${c.apiKey}:${c.secret}`).toString("base64");
const vnStamp = (d: Date) => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");

export async function createBackup(reason: string) {
  const c = cloudConfig();
  if (!c) throw new Error("Chưa cấu hình Cloudinary (CLOUDINARY_URL)");
  const { gz, counts } = await dumpAll();
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { folder: FOLDER, public_id: `walenty-${vnStamp(new Date())}.json.gz`, timestamp, type: "authenticated" };
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(gz)], { type: "application/gzip" }), params.public_id);
  for (const [k, v] of Object.entries(params)) fd.append(k, String(v));
  fd.append("api_key", c.apiKey);
  fd.append("signature", sign(params, c.secret));
  const r = await fetch(`https://api.cloudinary.com/v1_1/${c.cloudName}/raw/upload`, { method: "POST", body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Sao lưu thất bại: ${j.error?.message ?? r.status}`);
  await cleanup().catch(e => console.error("[backup] dọn bản cũ:", (e as Error).message));
  return { id: j.public_id as string, bytes: gz.length, counts, reason };
}

type Res = { public_id: string; bytes: number; created_at: string };

export async function listBackups(): Promise<Res[]> {
  const c = cloudConfig();
  if (!c) return [];
  const r = await fetch(`https://api.cloudinary.com/v1_1/${c.cloudName}/resources/raw/authenticated?prefix=${encodeURIComponent(FOLDER + "/")}&max_results=100`, {
    headers: { Authorization: auth(c) }, cache: "no-store",
  });
  if (!r.ok) throw new Error(`Không đọc được danh sách sao lưu (${r.status})`);
  const j = await r.json();
  return ((j.resources ?? []) as Res[]).map(x => ({ public_id: x.public_id, bytes: x.bytes, created_at: x.created_at }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// xóa bản quá 30 ngày (luôn giữ ít nhất 7 bản mới nhất)
async function cleanup() {
  const c = cloudConfig()!;
  const all = await listBackups();
  const old = all.slice(7).filter(x => Date.parse(x.created_at) < Date.now() - KEEP_DAYS * 86400e3).map(x => x.public_id);
  if (!old.length) return;
  const q = old.map(id => `public_ids[]=${encodeURIComponent(id)}`).join("&");
  await fetch(`https://api.cloudinary.com/v1_1/${c.cloudName}/resources/raw/authenticated?${q}`, { method: "DELETE", headers: { Authorization: auth(c) } });
}

// link tải riêng tư, hết hạn sau 10 phút
export function downloadUrl(publicId: string) {
  const c = cloudConfig();
  if (!c || !publicId.startsWith(FOLDER + "/")) return null;
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { attachment: "true", expires_at: timestamp + 600, public_id: publicId, timestamp, type: "authenticated" };
  const q = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), api_key: c.apiKey, signature: sign(params, c.secret) });
  return `https://api.cloudinary.com/v1_1/${c.cloudName}/raw/download?${q}`;
}
