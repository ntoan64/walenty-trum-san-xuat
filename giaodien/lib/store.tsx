"use client";

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import { can, ROLE_LABEL, type Action, type Role, type User } from "@core";
import type { DataState } from "@core/state";
import * as A from "./actions";
import { clearDrafts } from "./use-draft";
import type { Ctx, Result } from "./actions";

type Fn<Args extends unknown[]> = (c: Ctx, ...args: Args) => Result;
type Snap = { data: DataState; meId: string };

/* ---------- dữ liệu lấy từ server (MongoDB), tự làm mới để điện thoại / máy tính thấy giống nhau ---------- */
let snap: Snap | null = null;
let pending = 0; // số thao tác đang gửi, lúc đó tạm dừng làm mới
let started = false;
const listeners = new Set<() => void>();
const POLL_MS = 5000;

// JSON không có kiểu Date: chuỗi ISO → Date
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const revive = (_k: string, v: unknown) => (typeof v === "string" && ISO.test(v) ? new Date(v) : v);

function emit(next: Snap) {
  snap = next;
  listeners.forEach(l => l());
}

function toLogin() {
  if (!location.pathname.startsWith("/login")) location.replace("/login");
}

async function fetchState() {
  try {
    const r = await fetch("/api/state", { cache: "no-store" });
    if (r.status === 401) return toLogin();
    if (!r.ok) return;
    const j = JSON.parse(await r.text(), revive) as { state: DataState; meId: string };
    if (pending === 0) emit({ data: j.state, meId: j.meId });
  } catch {
    // mất mạng: giữ dữ liệu cũ, lần sau thử lại
  }
}

function start() {
  if (started) return;
  started = true;
  fetchState();
  setInterval(() => { if (!document.hidden && pending === 0) fetchState(); }, POLL_MS);
  window.addEventListener("focus", () => fetchState());
  document.addEventListener("visibilitychange", () => { if (!document.hidden) fetchState(); });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  start();
  return () => { listeners.delete(l); };
};

const meOf = (s: Snap) => s.data.users.find(u => u.id === s.meId);

// Gửi lên server, nhận lại kết quả + dữ liệu mới
async function post(url: string, body: unknown): Promise<Result> {
  pending++;
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.status === 401) { toLogin(); return { ok: false, error: "Phiên đăng nhập đã hết, đăng nhập lại" }; }
    const j = JSON.parse(await r.text(), revive) as { result?: Result; state?: DataState; error?: string };
    if (j.state && snap) snap = { ...snap, data: j.state };
    return j.result ?? (r.ok ? { ok: true, msg: "Xong" } : { ok: false, error: j.error ?? "Có lỗi, thử lại" });
  } catch {
    return { ok: false, error: "Mất kết nối máy chủ, kiểm tra mạng rồi thử lại" };
  } finally {
    pending--;
    if (snap) emit(snap);
  }
}

async function run<Args extends unknown[]>(_perm: Action | null, fn: Fn<Args>, ...args: Args): Promise<Result> {
  const name = A.actionName(fn);
  if (!name) return { ok: false, error: "Thao tác không hỗ trợ" };
  return post("/api/action", { name, args });
}

// Chạy thử trên bản sao ở trình duyệt để báo lỗi ngay (server vẫn kiểm tra lại)
function check<Args extends unknown[]>(perm: Action | null, fn: Fn<Args>, ...args: Args): Result {
  if (!snap) return { ok: false, error: "Đang tải dữ liệu" };
  const me = meOf(snap);
  if (!me) return { ok: false, error: "Chưa đăng nhập" };
  if (perm && !can(me.role, perm)) return { ok: false, error: "Vai trò của bạn không có quyền làm thao tác này" };
  return fn({ s: structuredClone(snap.data), me: me.name, meId: me.id, now: new Date() }, ...args);
}

async function logout() {
  clearDrafts(); // bản nháp form không để lại cho người dùng sau
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  location.replace("/login");
}

/* ---------- React ---------- */
interface StoreValue {
  data: DataState;
  meUser: User;
  role: Role;
  me: string;
  can: (a: Action) => boolean;
  run: typeof run;
  check: typeof check;
  post: typeof post;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const StoreCtx = createContext<StoreValue | null>(null);

export function StoreProvider({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const cur = useSyncExternalStore(subscribe, () => snap, () => null);

  const value = useMemo<StoreValue | null>(() => {
    const meUser = cur && meOf(cur);
    if (!cur || !meUser) return null;
    return {
      data: cur.data, meUser, role: meUser.role, me: meUser.name ?? ROLE_LABEL[meUser.role],
      can: (a: Action) => can(meUser.role, a), run, check, post, refresh: fetchState, logout,
    };
  }, [cur]);

  if (!value) return <>{fallback}</>;
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const v = useContext(StoreCtx);
  if (!v) throw new Error("useStore phải nằm trong StoreProvider");
  return v;
}

export { A };
