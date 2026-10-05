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
