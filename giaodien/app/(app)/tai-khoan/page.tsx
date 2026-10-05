"use client";

import { useRef, useState } from "react";
import { Camera, KeyRound, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { ROLE_LABEL } from "@core";
import { Button } from "@/components/ui/button";
import { useStore, A } from "@/lib/store";
import { useConfirmAction } from "@/lib/use-action";
import { Avatar, resizeImage } from "@/components/xf/avatar";
import { useDraft } from "@/lib/use-draft";
import { Field, PageHeader, Panel } from "@/components/xf/basics";

// Thông tin tài khoản: mỗi người tự đổi tên hiển thị, số điện thoại, ảnh đại diện
// key theo người dùng để form nạp lại khi đổi tài khoản
export default function ProfilePage() {
  const { meUser } = useStore();
  return <><Profile key={meUser.id} /><ChangePassword /></>;
}

function Profile() {
  const { meUser: me } = useStore();
  const act = useConfirmAction();
  const fileRef = useRef<HTMLInputElement>(null);
  const [f, setF] = useDraft(`profile:${me.id}:f`, { name: me.name, phone: me.phone });
  const [avatar, setAvatar] = useDraft<string | null | undefined>(`profile:${me.id}:avatar`, undefined); // undefined = chưa đổi

  if (!me) return <Panel><p className="text-[13px] text-muted-foreground">Không tìm thấy tài khoản.</p></Panel>;
  const shown = avatar === undefined ? me.avatar : avatar ?? undefined;
  const changed = avatar !== undefined || f.name !== me.name || f.phone !== me.phone;

  const pick = async (file?: File) => {
    if (!file) return;
    try { setAvatar(await resizeImage(file)); }
    catch (e) { toast.error((e as Error).message); }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await act(
      {
        title: "Lưu thông tin tài khoản?", confirmLabel: "Lưu",
        description: (
          <div className="mt-1 flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2.5 text-fg">
            <Avatar user={{ name: f.name, avatar: shown }} size={44} />
            <div className="text-[13px]"><b>{f.name}</b><div className="num text-muted-foreground">{f.phone}</div></div>
          </div>
        ),
      },
      null, A.updateProfile, { name: f.name, phone: f.phone, avatar },
    );
    if (r?.ok) setAvatar(undefined);
  };

  return (
    <>
      <PageHeader
        eyebrow={<>Tài khoản <span className="text-subtle">/</span> <span className="text-subtle">Thông tin</span></>}
        title="Thông tin tài khoản"
        desc="Ảnh đại diện và tên hiển thị sẽ hiện ở thanh bên, thông báo và danh sách nhân viên."
      />
      <Panel title="Hồ sơ của bạn" icon={UserRound}>
        <form onSubmit={save} className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex flex-col items-center gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} className="group relative rounded-full" aria-label="Đổi ảnh đại diện">
              <Avatar user={{ name: f.name || me.name, avatar: shown }} size={112} className="ring-4 ring-surface-2" />
              <span className="absolute inset-0 grid place-items-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <Camera className="size-6" />
              </span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={e => { pick(e.target.files?.[0]); e.target.value = ""; }} />
            <div className="flex gap-1.5">
              <Button type="button" size="sm" variant="secondary" onClick={() => fileRef.current?.click()}><Camera /> Chọn ảnh</Button>
              {shown && (
                <Button type="button" size="sm" variant="secondary" aria-label="Bỏ ảnh" onClick={() => setAvatar(null)}><Trash2 /></Button>
              )}
            </div>
          </div>
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Tên hiển thị" htmlFor="pf-name">
              <input id="pf-name" className="field-input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
            </Field>
            <Field label="Số điện thoại" htmlFor="pf-phone">
              <input id="pf-phone" type="tel" inputMode="tel" className="field-input num" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} />
            </Field>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Chức danh</div>
              <div className="field-input !bg-surface-low">{me.title ?? ROLE_LABEL[me.role]}</div>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Quyền</div>
              <div className="field-input !bg-surface-low">{ROLE_LABEL[me.role]}</div>
            </div>
            <div className="sm:col-span-2"><Button type="submit" disabled={!changed}>Lưu thay đổi</Button></div>
          </div>
        </form>
      </Panel>
    </>
  );
}

/* ---------- Tự đổi mật khẩu ---------- */
function ChangePassword() {
  const [f, setF] = useState({ current: "", next: "", again: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.next.length < 6) return toast.error("Mật khẩu mới tối thiểu 6 ký tự");
    if (f.next !== f.again) return toast.error("Nhập lại mật khẩu mới chưa khớp");
    setBusy(true);
    const r = await fetch("/api/me/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return toast.error(j.error ?? "Không đổi được mật khẩu");
    toast.success("Đã đổi mật khẩu");
    setF({ current: "", next: "", again: "" });
  };
  return (
    <Panel title="Đổi mật khẩu" icon={KeyRound}>
      <form onSubmit={submit} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-4">
        <Field label="Mật khẩu hiện tại" htmlFor="cp-cur">
          <input id="cp-cur" type="password" autoComplete="current-password" className="field-input" value={f.current} onChange={e => setF({ ...f, current: e.target.value })} />
        </Field>
        <Field label="Mật khẩu mới" htmlFor="cp-new">
          <input id="cp-new" type="password" autoComplete="new-password" className="field-input" value={f.next} onChange={e => setF({ ...f, next: e.target.value })} />
        </Field>
        <Field label="Nhập lại mật khẩu mới" htmlFor="cp-again">
          <input id="cp-again" type="password" autoComplete="new-password" className="field-input" value={f.again} onChange={e => setF({ ...f, again: e.target.value })} />
        </Field>
        <div><Button type="submit" disabled={busy || !f.current || !f.next}>Đổi mật khẩu</Button></div>
      </form>
    </Panel>
  );
}
