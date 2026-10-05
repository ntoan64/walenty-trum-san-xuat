"use client";

import { useCallback, useState } from "react";

// Bản nháp form: giữ nguyên khi chuyển trang / tải lại trong cùng tab trình duyệt.
// Lưu bộ nhớ + sessionStorage; xóa khi lưu thành công (clear) hoặc khi đăng xuất (clearDrafts).
const PREFIX = "draft:";
const mem = new Map<string, unknown>();

function read<T>(key: string): T | undefined {
  if (mem.has(key)) return mem.get(key) as T;
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (raw != null) return JSON.parse(raw) as T;
  } catch {}
  return undefined;
}

function write(key: string, value: unknown) {
  mem.set(key, value);
  try { sessionStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch {}
}

function remove(key: string) {
  mem.delete(key);
  try { sessionStorage.removeItem(PREFIX + key); } catch {}
}

export function clearDrafts() {
  mem.clear();
  try {
    Object.keys(sessionStorage).filter(k => k.startsWith(PREFIX)).forEach(k => sessionStorage.removeItem(k));
  } catch {}
}

export function useDraft<T>(key: string, init: T | (() => T)) {
  const initial = () => (typeof init === "function" ? (init as () => T)() : init);
  const [value, setValue] = useState<T>(() => read<T>(key) ?? initial());

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setValue(prev => {
      const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      write(key, v);
      return v;
    });
  }, [key]);

  // Lưu xong: về giá trị ban đầu và bỏ bản nháp
  const clear = useCallback((reset?: T) => {
    remove(key);
    setValue(reset ?? initial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [value, set, clear] as const;
}
