// Chống spam / phá kho phía server: giới hạn tần suất, bỏ thao tác trùng, khóa đăng nhập sai nhiều lần.
// Lưu trong bộ nhớ của server (đủ cho 1 máy chủ); khi lên Vercel nhiều máy có thể chuyển sang Mongo.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const recent = new Map<string, number>();

// true = còn được phép, false = vượt giới hạn
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count++;
  return b.count <= max;
}

export function retryAfter(key: string) {
  const b = buckets.get(key);
  return b ? Math.max(1, Math.ceil((b.resetAt - Date.now()) / 1000)) : 0;
}

export const clearLimit = (key: string) => buckets.delete(key);

// Cùng người + cùng thao tác + cùng dữ liệu trong vài giây → coi là bấm 2 lần
export function isDuplicate(key: string, windowMs = 4000) {
  const now = Date.now();
  const last = recent.get(key);
  recent.set(key, now);
  if (recent.size > 5000) for (const [k, t] of recent) if (now - t > windowMs) recent.delete(k);
  return last !== undefined && now - last < windowMs;
}

export const LIMIT = {
  actionsPerMinute: 40, // thao tác ghi / người / phút
  loginFailsPerUser: 5, // sai mật khẩu / tên đăng nhập / 15 phút
  loginPerIp: 30, // lần thử đăng nhập / IP / 15 phút
  loginWindowMs: 15 * 60_000,
  maxBodyBytes: 300_000, // ảnh đại diện đã thu nhỏ ~20KB, dư nhiều
};

export function bodyTooLarge(req: Request) {
  const len = Number(req.headers.get("content-length") ?? 0);
  return len > LIMIT.maxBodyBytes;
}

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}
