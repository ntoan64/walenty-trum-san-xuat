import { cookies } from "next/headers";
import { destroySession, SESSION_COOKIE } from "@server/auth";

export async function POST() {
  const c = await cookies();
  await destroySession(c.get(SESSION_COOKIE)?.value);
  c.delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
