"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LogoFull } from "@/components/logo";
import { Field } from "@/components/xf/basics";

export default function LoginPage() {
  const [f, setF] = useState({ login: "", password: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!f.login.trim() || !f.password) { setErr("Nhập tên đăng nhập và mật khẩu."); return; }
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? "Không đăng nhập được, thử lại."); return; }
      location.replace("/"); // tải lại hẳn để nạp dữ liệu của người vừa đăng nhập
    } catch {
      setErr("Mất kết nối máy chủ, kiểm tra mạng rồi thử lại.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute -top-32 -right-32 size-[28rem] rounded-full bg-brand/8 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-32 size-[24rem] rounded-full bg-brown/10 blur-3xl" />
      <form onSubmit={submit} className="card relative w-full max-w-sm rounded-xl p-6">
        <div className="mb-5 flex flex-col items-center text-center">
          <LogoFull className="size-36" />
          <p className="eyebrow mt-1 !text-brown">Trùm Sản Xuất · Quản lý sản xuất</p>
        </div>
        <div className="flex flex-col gap-3">
          <Field label="Tên đăng nhập hoặc số điện thoại" htmlFor="l-id">
            <input id="l-id" autoComplete="username" autoCapitalize="none" className="field-input" value={f.login} onChange={e => setF({ ...f, login: e.target.value })} />
          </Field>
          <Field label="Mật khẩu" htmlFor="l-pw">
            <input id="l-pw" type="password" autoComplete="current-password" className="field-input" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} />
          </Field>
          {err && <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-[13px] text-bad">{err}</p>}
          <Button type="submit" className="mt-1 w-full" disabled={busy}>{busy ? "Đang đăng nhập…" : "Đăng nhập"}</Button>
        </div>
        <p className="mt-4 text-center text-[11.5px] text-subtle">Chưa có tài khoản? Liên hệ admin (Quản lý kho) để được cấp.</p>
      </form>
    </main>
  );
}
