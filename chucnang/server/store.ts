// Đọc / ghi toàn bộ dữ liệu nghiệp vụ trên MongoDB và chạy thao tác phía server
import type { AnyBulkWriteOperation, Document } from "mongodb";
import { getDb } from "./db";
import { hashPassword } from "./auth";
import { ACTIONS, type Result } from "../core/actions";
import { can } from "../core/permissions";
import { COLLECTIONS, createBaseState, type CollectionKey, type DataState } from "../core/state";
import type { AuditEntry, Notification, User } from "../core/types";

// writing: đang ghi dở (đã giữ version mới nhưng chưa ghi xong dữ liệu) → người đọc phải đợi
type Meta = { _id: "meta"; version: number; seq: DataState["seq"]; writing?: boolean; writingAt?: Date };
const WRITE_STALE_MS = 15_000; // ghi dở quá lâu (máy chủ chết giữa chừng) thì bỏ qua cờ
const KEYS = Object.keys(COLLECTIONS) as CollectionKey[];

// Giữ dung lượng gọn cho gói Mongo 512MB:
// - thông báo tự xóa sau 6 tháng, lịch sử thao tác sau 2 năm, phiên đăng nhập khi hết hạn
// - chỉ tải 200 thông báo mới nhất lên giao diện
export const RETENTION = { notificationDays: 180, auditDays: 730, notificationsLoaded: 200 };
let indexesReady = false;

// Tạo chỉ mục tự xóa; nếu đã có với thời hạn cũ thì cập nhật thời hạn mới (collMod)
async function ttlIndex(col: string, field: string, seconds: number) {
  const db = await getDb();
  try {
    await db.collection(col).createIndex({ [field]: 1 }, { expireAfterSeconds: seconds });
  } catch (e) {
    const code = (e as { code?: number }).code;
    if (code !== 85 && code !== 86) throw e; // 85/86 = đã có chỉ mục khác tùy chọn
    await db.command({ collMod: col, index: { keyPattern: { [field]: 1 }, expireAfterSeconds: seconds } });
  }
}

async function ensureIndexes() {
  if (indexesReady) return;
  const db = await getDb();
  await Promise.all([
    ttlIndex("notifications", "sentAt", RETENTION.notificationDays * 86400),
    ttlIndex("audit", "at", RETENTION.auditDays * 86400),
    ttlIndex("sessions", "expiresAt", 0),
    ttlIndex("tg_links", "expiresAt", 0),
    db.collection("audit").createIndex({ userId: 1, at: -1 }),
    db.collection("events").createIndex({ at: 1 }),
  ]);
  indexesReady = true;
}

// Bộ nhớ đệm theo version: chỉ đọc lại toàn bộ khi có người vừa ghi (meta.version đổi).
// Mỗi máy chủ giữ bản riêng; so version mỗi lần nên luôn đúng dữ liệu mới nhất.
let cache: { version: number; state: DataState } | null = null;

export async function currentVersion() {
  const db = await getDb();
  const meta = await db.collection<Meta>("meta").findOne({ _id: "meta" }, { projection: { version: 1 } });
  return meta?.version ?? 0;
}

const busy = (m: Meta) => !!m.writing && !!m.writingAt && Date.now() - m.writingAt.getTime() < WRITE_STALE_MS;

// Đọc trọn bộ dữ liệu nhất quán: không đọc khi có người đang ghi dở, đọc xong mà version đổi thì đọc lại
async function readAll(): Promise<{ state: DataState; version: number } | null> {
  const db = await getDb();
  for (let i = 0; i < 200; i++) {
    const meta = await db.collection<Meta>("meta").findOne({ _id: "meta" });
    if (!meta) return null;
    if (busy(meta)) { await new Promise(r => setTimeout(r, 40)); continue; }
    if (cache && cache.version === meta.version) return cache;
    const parts = await Promise.all(KEYS.map(k => k === "notifications"
      ? db.collection(COLLECTIONS[k]).find().sort({ sentAt: -1 }).limit(RETENTION.notificationsLoaded).toArray()
      : db.collection(COLLECTIONS[k]).find().toArray()));
    const after = await db.collection<Meta>("meta").findOne({ _id: "meta" }, { projection: { version: 1, writing: 1, writingAt: 1 } });
    if (!after || after.version !== meta.version || busy(after as Meta)) continue; // có người ghi chen giữa lúc đọc
    const state = { seq: meta.seq } as DataState;
    KEYS.forEach((k, j) => {
      // _id trong Mongo chính là id của bản ghi
      (state as unknown as Record<string, unknown[]>)[k] = parts[j].map(({ _id, ...rest }) => ({ ...rest, id: _id }));
    });
    if (!cache || cache.version <= meta.version) cache = { state, version: meta.version };
    return { state, version: meta.version };
  }
  throw new Error("Dữ liệu đang được ghi, thử lại sau giây lát");
}

// Database trống → tạo 3 người dùng + 2 xưởng. Mật khẩu admin ban đầu lấy từ ADMIN_PASSWORD (nếu có)
async function seed() {
  const db = await getDb();
  const base = createBaseState();
  const adminPw = process.env.ADMIN_PASSWORD || "walenty@2026";
  base.users[0].passwordHash = await hashPassword(adminPw);
  for (const k of KEYS) {
    const docs = (base[k] as { id: string }[]).map(({ id, ...rest }) => ({ _id: id, ...rest }));
    if (docs.length) await db.collection(COLLECTIONS[k]).insertMany(docs as unknown as Document[]);
  }
  await db.collection<Meta>("meta").insertOne({ _id: "meta", version: 1, seq: base.seq });
}

export async function loadState() {
  await ensureIndexes();
  let r = await readAll();
  if (!r) {
    try { await seed(); } catch (e) {
      // 2 request seed cùng lúc: bên thua bị lỗi trùng meta, đọc lại là được
      if ((e as { code?: number }).code !== 11000) throw e;
    }
    r = await readAll();
  }
  return r!;
}

// Ghi những bản ghi có thay đổi (so JSON trước / sau). Không xóa cứng dữ liệu nghiệp vụ.
async function writeDiff(before: DataState, after: DataState) {
  const db = await getDb();
  for (const k of KEYS) {
    const old = new Map((before[k] as { id: string }[]).map(d => [d.id, JSON.stringify(d)]));
    const ops: AnyBulkWriteOperation<Document>[] = [];
    for (const d of after[k] as { id: string }[]) {
      if (old.get(d.id) === JSON.stringify(d)) continue;
      const { id, ...rest } = d;
      ops.push({ replaceOne: { filter: { _id: id as unknown as Document["_id"] }, replacement: rest, upsert: true } });
    }
    if (ops.length) await db.collection(COLLECTIONS[k]).bulkWrite(ops, { ordered: false });
  }
}

export async function audit(e: Omit<AuditEntry, "id" | "at">) {
  const db = await getDb();
  await db.collection("audit").insertOne({ ...e, at: new Date() });
}

/**
 * Chạy 1 thao tác cho người dùng `user`. Kiểm tra quyền ở server, chạy trên bản sao,
 * ghi lại nếu thành công. Nếu cùng lúc có người khác vừa ghi (version đổi) thì chạy lại.
 */
// onNotify: nhận các thông báo mới sinh ra (để route gửi Telegram sau khi trả lời người dùng)
export async function runAction(user: User, name: string, args: unknown[], onNotify?: (n: Notification[], users: User[]) => void): Promise<Result> {
  const entry = ACTIONS[name];
  if (!entry) return { ok: false, error: "Thao tác không tồn tại" };
  const [perm, fn, label] = entry;
  if (perm && !can(user.role, perm)) return { ok: false, error: "Vai trò của bạn không có quyền làm thao tác này" };

  const db = await getDb();
  for (let attempt = 0; attempt < 8; attempt++) {
    // có người vừa ghi chen vào → đợi ngẫu nhiên một chút rồi chạy lại trên dữ liệu mới
    if (attempt) await new Promise(r => setTimeout(r, 20 + Math.random() * 60 * attempt));
    const { state, version } = await loadState();
    const draft = structuredClone(state);
    const res = fn({ s: draft, me: user.name, meId: user.id, now: new Date() }, ...args);
    if (!res.ok) return res;
    // Khóa lạc quan: chỉ ghi nếu chưa ai ghi chen vào
    const claimed = await db.collection<Meta>("meta").updateOne(
      { _id: "meta", version },
      { $set: { version: version + 1, seq: draft.seq, writing: true, writingAt: new Date() } },
    );
    if (claimed.matchedCount === 0) continue;
    try {
      await writeDiff(state, draft);
    } finally {
      // ghi xong (hoặc lỗi) thì mở cho người khác đọc
      await db.collection<Meta>("meta").updateOne({ _id: "meta", version: version + 1 }, { $set: { writing: false } });
    }
    if (!cache || cache.version <= version + 1) cache = { state: draft, version: version + 1 };
    const ref = res.id ?? (typeof args[0] === "string" && /^(LSX|R)-/.test(args[0]) ? args[0] : undefined);
    await audit({ userId: user.id, userName: user.name, action: name, label, detail: res.msg, ref });
    if (onNotify) {
      const old = new Set(state.notifications.map(n => n.id));
      const fresh = draft.notifications.filter(n => !old.has(n.id));
      if (fresh.length) onNotify(fresh, draft.users);
    }
    return res;
  }
  return { ok: false, error: "Đang có nhiều người thao tác cùng lúc, thử lại sau giây lát" };
}

// Bản gửi xuống trình duyệt: bỏ hash mật khẩu, chỉ báo có / chưa có mật khẩu
export function toClient(state: DataState): DataState {
  return {
    ...state,
    users: state.users.map(({ passwordHash, ...u }) => ({ ...u, hasPassword: !!passwordHash })),
  };
}

export async function listAudit(filter: { userId?: string; from?: Date; to?: Date; limit?: number }) {
  const db = await getDb();
  const q: Document = {};
  if (filter.userId) q.userId = filter.userId;
  if (filter.from || filter.to) q.at = { ...(filter.from && { $gte: filter.from }), ...(filter.to && { $lte: filter.to }) };
  const rows = await db.collection("audit").find(q).sort({ at: -1 }).limit(Math.min(filter.limit ?? 300, 1000)).toArray();
  return rows.map(({ _id, ...r }) => ({ ...r, id: String(_id) })) as AuditEntry[];
}
