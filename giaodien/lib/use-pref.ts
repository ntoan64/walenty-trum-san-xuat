"use client";

import { useCallback, useState } from "react";

// Tùy chọn giao diện theo máy (đóng/mở cột Xưởng Bot…), nhớ qua các lần mở app
export function usePref<T>(key: string, init: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`pref:${key}`);
      if (raw != null) return JSON.parse(raw) as T;
    } catch {}
    return init;
  });
  const set = useCallback((v: T) => {
    setValue(v);
    try { localStorage.setItem(`pref:${key}`, JSON.stringify(v)); } catch {}
  }, [key]);
  return [value, set] as const;
}
