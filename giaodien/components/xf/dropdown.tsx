"use client";

import { useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { usePopoverPos } from "@/lib/use-popover-pos";

const LIST = "overflow-auto rounded-lg border border-line bg-surface p-1 shadow-lg";

// Danh sách xổ xuống cho ô tìm kiếm.
// Ngoài hộp thoại: vẽ ở gốc trang (portal) nên không bị khung "overflow-hidden" hay hiệu ứng chuyển động cắt mất.
// Trong hộp thoại: xổ ngay dưới ô (để bấm chọn không bị hộp thoại coi là bấm ra ngoài).
export function Dropdown({ anchor, open, id, children }: { anchor: RefObject<HTMLElement | null>; open: boolean; id: string; children: React.ReactNode }) {
  const [inDialog, setInDialog] = useState<boolean | null>(null);
  // phải đọc vị trí trong trang sau khi vẽ (có nằm trong hộp thoại không)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (open) setInDialog(!!anchor.current?.closest('[role="dialog"]')); }, [open, anchor]);
  const pos = usePopoverPos(anchor, open && inDialog === false);
  if (!open || inDialog === null) return null;
  if (inDialog) return <ul id={id} role="listbox" className={`absolute z-30 mt-1 max-h-72 w-full ${LIST}`}>{children}</ul>;
  return createPortal(<ul id={id} role="listbox" style={pos} className={LIST}>{children}</ul>, document.body);
}
