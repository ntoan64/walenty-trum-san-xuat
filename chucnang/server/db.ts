import path from "node:path";
import fs from "node:fs";
import { MongoClient, type Db } from "mongodb";

// Đọc chucnang/.env (Next.js chỉ tự đọc .env trong thư mục giaodien)
function loadEnv() {
  if (process.env.MONGODB_URI) return;
  const candidates = [
    path.resolve(process.cwd(), "../chucnang/.env"),
    path.resolve(process.cwd(), "chucnang/.env"),
    path.resolve(process.cwd(), ".env"),
  ];
  for (const f of candidates) {
    if (fs.existsSync(f)) {
      process.loadEnvFile(f);
      if (process.env.MONGODB_URI) return;
    }
  }
}

// Giữ 1 kết nối dùng chung (dev server hot-reload không mở thêm kết nối)
const g = globalThis as unknown as { __mongo?: Promise<MongoClient> };

export async function getDb(): Promise<Db> {
  loadEnv();
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Thiếu MONGODB_URI trong chucnang/.env");
  g.__mongo ??= new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 }).connect();
  try {
    const client = await g.__mongo;
    return client.db(); // tên database lấy từ URI (walentykho)
  } catch (e) {
    g.__mongo = undefined;
    throw e;
  }
}
