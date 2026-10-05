"use client";

import { useState } from "react";
import { Eye, EyeOff, KeyRound, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { ROLE_LABEL, ROLES, type Role, type User } from "@core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore, A } from "@/lib/store";
import { useConfirmAction } from "@/lib/use-action";
import { Summary, useConfirm } from "@/components/xf/confirm-provider";
import { Collapsible } from "@/components/xf/collapsible";
import { Avatar } from "@/components/xf/avatar";
import { BackupPanel } from "@/components/xf/backup-panel";
import { Field, PageHeader, Panel, StatCard, StatusPill, TableWrap } from "@/components/xf/basics";

// Gợi ý mật khẩu ngẫu nhiên dễ đọc cho admin cấp
function genPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const a = new Uint32Array(8);
  crypto.getRandomValues(a);
  return Array.from(a, n => chars[n % chars.length]).join("");
}

function PasswordInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(true);
  return (
    <div className="flex gap-1">
      <input id={id} type={show ? "text" : "password"} autoComplete="new-password" className="field-input num" value={value} onChange={e => onChange(e.target.value)} />
      <Button type="button" variant="secondary" aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"} onClick={() => setShow(!show)}>{show ? <EyeOff /> : <Eye />}</Button>
      <Button type="button" variant="secondary" onClick={() => onChange(genPassword())}>Tạo</Button>
    </div>
  );
}

/* ---------- Admin cấp tài khoản ---------- */
function CreateAccount() {
  const { post } = useStore();
  const ask = useConfirm();
  const empty = { name: "", username: "", phone: "", role: "qc" as Role, title: "", password: "" };
  const [f, setF] = useState(empty);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim() || !f.username.trim()) return toast.error("Nhập tên và tên đăng nhập");
    if (f.password.length < 6) return toast.error("Mật khẩu tối thiểu 6 ký tự");
    const ok = await ask({
      title: "Cấp tài khoản?", confirmLabel: "Cấp tài khoản",
      description: (
        <>
          <Summary rows={[["Tên", f.name], ["Tên đăng nhập", f.username.trim().toLowerCase()], ["Mật khẩu", f.password], ["Quyền", ROLE_LABEL[f.role]], ["Chức danh", f.title || ROLE_LABEL[f.role]]]} />
          <p className="mt-2 text-xs">Ghi lại mật khẩu để gửi cho nhân viên. Sau khi lưu sẽ không xem lại được.</p>
        </>
      ),
    });
    if (!ok) return;
    const r = await post("/api/users", f);
    if (r.ok) { toast.success(r.msg); setF(empty); } else toast.error(r.error);
  };

  return (
    <Collapsible title="Cấp tài khoản mới" icon={UserPlus}>
      <form onSubmit={submit} className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] items-end gap-3 p-4 md:p-5">
        <Field label="Tên nhân viên" htmlFor="u-name">
          <input id="u-name" className="field-input" maxLength={60} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Tên đăng nhập" htmlFor="u-username">
          <input id="u-username" className="field-input num lowercase" maxLength={30} autoComplete="off" placeholder="vd: thao.qc" value={f.username} onChange={e => setF({ ...f, username: e.target.value })} />
        </Field>
        <Field label="Số điện thoại" htmlFor="u-phone">
          <input id="u-phone" type="tel" inputMode="tel" className="field-input num" maxLength={15} value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} />
        </Field>
        <Field label="Quyền" htmlFor="u-role">
          <select id="u-role" className="field-input" value={f.role} onChange={e => setF({ ...f, role: e.target.value as Role })}>
            {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </Field>
        <Field label="Chức danh (tùy chọn)" htmlFor="u-title">
          <input id="u-title" className="field-input" maxLength={40} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
        </Field>
        <Field label="Mật khẩu" htmlFor="u-pw" className="sm:col-span-2">
          <PasswordInput id="u-pw" value={f.password} onChange={v => setF({ ...f, password: v })} />
        </Field>
        <div><Button type="submit">Cấp tài khoản</Button></div>
      </form>
    </Collapsible>
  );
}

/* ---------- Đặt lại mật khẩu ---------- */
function ResetPassword({ user, onClose }: { user: User; onClose: () => void }) {
  const { post } = useStore();
  const [pw, setPw] = useState(() => genPassword());
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (pw.length < 6) return toast.error("Mật khẩu tối thiểu 6 ký tự");
    setBusy(true);
    const r = await post(`/api/users/${user.id}/password`, { password: pw });
    setBusy(false);
    if (r.ok) { toast.success(r.msg); onClose(); } else toast.error(r.error);
  };
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg text-brand">{user.hasPassword ? "Đặt lại" : "Cấp"} mật khẩu cho {user.name}</DialogTitle>
          <DialogDescription>Tên đăng nhập: <b className="num">{user.username ?? "—"}</b>. Ghi lại mật khẩu để gửi cho nhân viên.</DialogDescription>
        </DialogHeader>
        <PasswordInput id="rs-pw" value={pw} onChange={setPw} />
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button onClick={save} disabled={busy}>Lưu mật khẩu</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function UsersPage() {
  const { data: s, meUser } = useStore();
  const act = useConfirmAction();
  const [reset, setReset] = useState<User | null>(null);
  const active = s.users.filter(u => u.active).length;
  const withPw = s.users.filter(u => u.active && u.hasPassword).length;

  return (
    <>
      <PageHeader
        eyebrow={<>Quản trị <span className="text-subtle">/</span> <span className="text-subtle">Nhân viên</span></>}
        title="Nhân viên & tài khoản"
        desc="Chỉ admin cấp tài khoản và mật khẩu. Nhân viên đăng nhập bằng tên đăng nhập hoặc số điện thoại."
        aside={
          <div className="grid w-full grid-cols-2 gap-2 min-[1500px]:w-auto">
            <StatCard className="min-[1500px]:min-w-[130px]" label="Đang hoạt động" value={active} unit="người" tone="brand" />
            <StatCard className="min-[1500px]:min-w-[130px]" label="Đã có mật khẩu" value={withPw} unit="người" tone="brown" />
          </div>
        }
      />
      <CreateAccount />
      <Panel title="Danh sách tài khoản" icon={Users} flush>
        <TableWrap>
          <table className="wl-table">
            <thead><tr><th>Nhân viên</th><th>Tên đăng nhập</th><th>Quyền</th><th>Số điện thoại</th><th>Mật khẩu</th><th>Trạng thái</th><th className="r">Thao tác</th></tr></thead>
            <tbody>
              {s.users.map(u => (
                <tr key={u.id} className={u.active ? "" : "opacity-60"}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <Avatar user={u} size={34} />
                      <div>
                        <b className="font-serif">{u.name}</b>
                        {u.title && <div className="text-xs text-brown">{u.title}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="num">{u.username ?? "—"}</td>
                  <td>{ROLE_LABEL[u.role]}</td>
                  <td className="num">{u.phone}</td>
                  <td>{u.hasPassword ? <StatusPill tone="ok" dot>Đã cấp</StatusPill> : <StatusPill tone="warn" dot>Chưa cấp</StatusPill>}</td>
                  <td>{u.active ? <StatusPill tone="ok">Hoạt động</StatusPill> : <StatusPill tone="bad">Đã khóa</StatusPill>}</td>
                  <td className="r whitespace-nowrap">
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" variant="secondary" onClick={() => setReset(u)}><KeyRound /> {u.hasPassword ? "Đặt lại MK" : "Cấp MK"}</Button>
                      {u.id !== meUser.id && (
                        <Button size="sm" variant="secondary" onClick={() => act(
                          u.active
                            ? { title: `Khóa tài khoản ${u.name}?`, confirmLabel: "Khóa", description: "Người này sẽ bị đăng xuất, không đăng nhập và không nhận thông báo nữa. Dữ liệu cũ vẫn giữ nguyên." }
                            : { title: `Mở khóa ${u.name}?`, confirmLabel: "Mở khóa", description: "Người này đăng nhập và nhận thông báo lại được." },
                          "user.manage", A.toggleUser, u.id,
                        )}>{u.active ? "Khóa" : "Mở khóa"}</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Panel>
      <BackupPanel />
      {reset && <ResetPassword user={reset} onClose={() => setReset(null)} />}
    </>
  );
}
