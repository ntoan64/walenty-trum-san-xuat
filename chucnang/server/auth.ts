import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { User } from "../core/types";
import { getDb } from "./db";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = "wts_session";
const SESSION_DAYS = 30;

/* ---------- mật khẩu: scrypt + salt ngẫu nhiên ---------- */
export function validatePassword(pw: string) {
  if (pw.length < 6) return "Mật khẩu tối thiểu 6 ký tự";
  if (pw.length > 100) return "Mật khẩu quá dài";
  return null;
}

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const key = await scryptAsync(pw, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(pw: string, stored?: string) {
  if (!stored) return false;
  const [algo, saltHex, keyHex] = stored.split("$");
  if (algo !== "scrypt" || !saltHex || !keyHex) return false;
  const key = await scryptAsync(pw, Buffer.from(saltHex, "hex"), 64);
  const want = Buffer.from(keyHex, "hex");
  return want.length === key.length && timingSafeEqual(want, key);
}

/* ---------- phiên đăng nhập: token ngẫu nhiên trong cookie, chỉ lưu hash trong Mongo ---------- */
const tokenHash = (t: string) => createHash("sha256").update(t).digest("hex");

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  const db = await getDb();
  await db.collection<{ _id: string; userId: string; expiresAt: Date; createdAt: Date }>("sessions")
    .insertOne({ _id: tokenHash(token), userId, expiresAt, createdAt: new Date() });
  return { token, expiresAt };
}

export async function destroySession(token?: string) {
  if (!token) return;
  const db = await getDb();
  await db.collection<{ _id: string }>("sessions").deleteOne({ _id: tokenHash(token) });
}

// Người dùng đang đăng nhập (đã khóa hoặc hết hạn thì coi như chưa đăng nhập)
export async function userFromToken(token?: string): Promise<User | null> {
  if (!token) return null;
  const db = await getDb();
  const s = await db.collection<{ _id: string; userId: string; expiresAt: Date }>("sessions").findOne({ _id: tokenHash(token) });
  if (!s || s.expiresAt < new Date()) return null;
  const u = await db.collection<User & { _id: string }>("users").findOne({ _id: s.userId });
  if (!u || !u.active) return null;
  const { _id, ...rest } = u;
  return { ...rest, id: _id };
}

export async function findUserForLogin(login: string) {
  const db = await getDb();
  const key = login.trim().toLowerCase();
  const phone = login.replace(/\s/g, "");
  const users = await db.collection<User & { _id: string }>("users").find({ active: true }).toArray();
  const u = users.find(x => x.username === key || (phone.length >= 9 && x.phone?.replace(/\s/g, "") === phone));
  return u ? { ...u, id: u._id } : null;
}
