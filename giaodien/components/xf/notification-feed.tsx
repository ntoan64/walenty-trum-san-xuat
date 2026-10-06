"use client";

import { PenLine, Send, X } from "lucide-react";
import { ROLE_LABEL } from "@core";
import { Button } from "@/components/ui/button";
import { fmtDT } from "@/lib/format";
import { useStore, A } from "@/lib/store";
import { useConfirmAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";
import { useDraft } from "@/lib/use-draft";
import { Avatar } from "./avatar";

/* ---------- Soạn thông báo gửi riêng cho từng thành viên ---------- */
function Composer({ onDone }: { onDone: () => void }) {
  const { data: s, me } = useStore();
  const act = useConfirmAction();
  const people = s.users.filter(u => u.active && u.name !== me);
  const [to, setTo] = useDraft<string[]>("msg:to", []);
  const [text, setText] = useDraft("msg:text", "");
  const all = people.length > 0 && to.length === people.length;
  const toggle = (id: string) => setTo(t => (t.includes(id) ? t.filter(x => x !== id) : [...t, id]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const names = people.filter(u => to.includes(u.id)).map(u => u.name).join(", ");
    const r = await act(
      {
        title: "Gửi thông báo?", confirmLabel: "Gửi",
        description: (
          <div className="mt-1 rounded-lg bg-surface-2 px-3 py-2.5 text-[13px] text-fg">
            <div className="mb-1 text-xs font-semibold text-brown">Gửi: {names}</div>
            <p className="whitespace-pre-line">{text.trim()}</p>
          </div>
        ),
      },
      "notify.send", A.sendMessage, { userIds: to, text },
    );
    if (r?.ok) { setText(""); setTo([]); onDone(); }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 border-b border-line p-3">
      <div className="flex items-center justify-between">
        <span className="eyebrow">Gửi cho</span>
        <button type="button" className="text-xs font-semibold text-brand hover:underline" onClick={() => setTo(all ? [] : people.map(u => u.id))}>
          {all ? "Bỏ chọn" : "Chọn tất cả"}
        </button>
      </div>
      <div role="group" aria-label="Người nhận" className="flex flex-wrap gap-1.5">
        {people.map(u => {
          const on = to.includes(u.id);
          return (
            <button key={u.id} type="button" aria-pressed={on} onClick={() => toggle(u.id)}
              className={cn("rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
                on ? "bg-brand text-brand-fg" : "bg-surface-2 text-muted-foreground hover:bg-surface-3")}>
              {u.name}{u.title ? <span className="font-normal opacity-75"> · {u.title}</span> : null}
            </button>
          );
        })}
      </div>
      <label htmlFor="msg-text" className="sr-only">Nội dung</label>
      <textarea id="msg-text" rows={3} maxLength={1000} placeholder="Nội dung thông báo…" value={text} onChange={e => setText(e.target.value)}
        className="field-input resize-y !min-h-[72px]" />
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={onDone}>Đóng</Button>
        <Button type="submit" size="sm" disabled={!to.length || !text.trim()}><Send /> Gửi</Button>
      </div>
    </form>
  );
}

export function NotificationFeed({ onClose }: { onClose?: () => void }) {
  const { data, can } = useStore();
  const [compose, setCompose] = useDraft("msg:open", false);
  return (
    <aside aria-label="Thông báo Telegram" className="card flex min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-xl">
      <div className="flex items-center gap-3 bg-surface-low px-4 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-brand-fg">
          <Send className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <b className="block font-serif text-[15px] text-brand">Xưởng Bot</b>
          <small className="text-xs text-muted-foreground">Mô phỏng tin Telegram đã gửi</small>
        </div>
        {onClose && (
          <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Đóng Xưởng Bot" title="Đóng Xưởng Bot" className="order-last">
            <X />
          </Button>
        )}
        {can("notify.send") && (
          <Button size="sm" variant={compose ? "secondary" : "default"} onClick={() => setCompose(!compose)} aria-expanded={compose} aria-label={compose ? "Đóng soạn thông báo" : "Soạn thông báo"}>
            {compose ? <X /> : <><PenLine /> Soạn</>}
          </Button>
        )}
      </div>
      {compose && <Composer onDone={() => setCompose(false)} />}
      <ol className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3">
        {!data.notifications.some(n => n.from) && <li className="py-8 text-center text-[13px] text-muted-foreground">Chưa có tin nhắn nào.</li>}
        {data.notifications.filter(n => n.from).map((n, i) => {
          const names = n.users
            ? data.users.filter(u => n.users!.includes(u.id)).map(u => u.name)
            : data.users.filter(u => u.active && n.roles.includes(u.role)).map(u => u.name);
          return (
            <li
              key={n.id}
              className={cn(
                "rounded-[4px_12px_12px_12px] px-3 py-2 text-[13px]",
                n.from ? "bg-brand-soft/60" : "bg-surface-2",
                i === 0 && "animate-in fade-in slide-in-from-top-1 duration-500",
              )}
            >
              <div className="mb-0.5 text-[11px] font-semibold text-brown">
                {n.from && (
                  <span className="mr-1 inline-flex items-center gap-1 align-middle text-brand">
                    <Avatar user={data.users.find(u => u.name === n.from)} name={n.from} size={18} /> {n.from} →
                  </span>
                )}
                Gửi: {names.join(", ") || "—"}
                {!n.users && <> ({n.roles.map(r => ROLE_LABEL[r]).join(" + ")})</>}
              </div>
              <p className="whitespace-pre-line">{n.text}</p>
              <time className="num mt-0.5 block text-right text-[10.5px] text-subtle">{fmtDT(n.sentAt)}</time>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
