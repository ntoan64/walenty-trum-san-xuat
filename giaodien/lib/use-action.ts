"use client";

import { toast } from "sonner";
import type { Action } from "@core";
import { useStore } from "./store";
import type { Ctx, Result } from "./actions";
import { useConfirm, type ConfirmOptions } from "@/components/xf/confirm-provider";

type Fn<Args extends unknown[]> = (c: Ctx, ...a: Args) => Result;

// Đang gửi 1 thao tác thì không nhận thêm (chống bấm liên tục)
let inflight = false;

// Gửi thao tác lên server + hiện toast. Trả về Result để form hiện lỗi dưới ô.
export function useAction() {
  const { run } = useStore();
  return async <Args extends unknown[]>(perm: Action | null, fn: Fn<Args>, ...args: Args): Promise<Result> => {
    if (inflight) return toastError("Đang xử lý thao tác trước, đợi chút");
    inflight = true;
    try {
      const res = await run(perm, fn, ...args);
      if (res.ok) toast.success(res.msg);
      else toast.error(res.error);
      return res;
    } finally {
      inflight = false;
    }
  };
}

// Báo lỗi nhập liệu ngay, không gửi đi
export function toastError(error: string): Result {
  toast.error(error);
  return { ok: false, error };
}

// Kiểm tra trước (sai thì báo lỗi luôn), đúng thì hỏi "có muốn xử lý không" rồi mới gửi.
// Trả null nếu người dùng bấm Hủy.
export function useConfirmAction() {
  const { check } = useStore();
  const act = useAction();
  const ask = useConfirm();
  return async <Args extends unknown[]>(opts: ConfirmOptions, perm: Action | null, fn: Fn<Args>, ...args: Args): Promise<Result | null> => {
    if (inflight) return toastError("Đang xử lý thao tác trước, đợi chút");
    const test = check(perm, fn, ...args);
    if (!test.ok) return toastError(test.error);
    if (!(await ask(opts))) return null;
    return act(perm, fn, ...args);
  };
}
