import { cookies } from "next/headers";
import { SESSION_COOKIE, userFromToken } from "@server/auth";

// Người dùng đang đăng nhập (dùng trong route handler / server component)
export async function currentUser() {
  const c = await cookies();
  return userFromToken(c.get(SESSION_COOKIE)?.value);
}

export const unauthorized = () => Response.json({ error: "Chưa đăng nhập" }, { status: 401 });
export const forbidden = () => Response.json({ error: "Không có quyền" }, { status: 403 });
export const bad = (error: string) => Response.json({ error }, { status: 400 });

// Lỗi kết nối MongoDB (sai URI, Atlas chặn IP…) → báo rõ cho người dùng, ghi chi tiết vào log server
export function serverError(e: unknown) {
  const err = e as { name?: string; message?: string };
  console.error("[api]", err?.name, err?.message);
  const db = /Mongo|ECONNREFUSED|ENOTFOUND|querySrv|Server selection|MONGODB_URI/i.test(`${err?.name} ${err?.message}`);
  return Response.json(
    { error: db ? "Không kết nối được cơ sở dữ liệu. Báo quản trị kiểm tra MongoDB (Network Access / MONGODB_URI)." : "Lỗi máy chủ, thử lại sau." },
    { status: db ? 503 : 500 },
  );
}
