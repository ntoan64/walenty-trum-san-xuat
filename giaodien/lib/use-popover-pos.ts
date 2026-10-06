"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

// Vị trí danh sách gợi ý: nổi trên mọi khung (position fixed), không bị khung cha "overflow-hidden" cắt mất.
// Dưới không đủ chỗ thì mở lên trên.
export function usePopoverPos(anchor: RefObject<HTMLElement | null>, open: boolean, maxH = 288) {
  const [style, setStyle] = useState<React.CSSProperties>({});
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom, up = below < Math.min(maxH, 200) && r.top > below;
      setStyle({
        position: "fixed", left: r.left, width: r.width, zIndex: 60,
        maxHeight: Math.max(120, Math.min(maxH, (up ? r.top : below) - 12)),
        ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
      });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [anchor, open, maxH]);
  return style;
}
