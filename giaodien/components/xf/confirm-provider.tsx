"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
}

type Ask = (o: ConfirmOptions) => Promise<boolean>;
const ConfirmCtx = createContext<Ask | null>(null);

// Một hộp xác nhận dùng chung: mọi thao tác ghi dữ liệu hỏi "có muốn xử lý không" trước khi chạy
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const ask = useCallback<Ask>(o => {
    resolver.current?.(false);
    setOpts(o);
    return new Promise<boolean>(res => { resolver.current = res; });
  }, []);

  const close = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  };

  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      <Dialog open={!!opts} onOpenChange={open => { if (!open) close(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg text-brand">{opts?.title}</DialogTitle>
            {opts?.description && <DialogDescription render={<div />} className="text-[13.5px] leading-relaxed">{opts.description}</DialogDescription>}
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => close(false)}>Hủy</Button>
            <Button autoFocus onClick={() => close(true)}>{opts?.confirmLabel ?? "Xác nhận"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  const v = useContext(ConfirmCtx);
  if (!v) throw new Error("useConfirm phải nằm trong ConfirmProvider");
  return v;
}

// Dòng tóm tắt trong hộp xác nhận
export function Summary({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-surface-2 px-3 py-2.5 text-[13px] text-fg">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
