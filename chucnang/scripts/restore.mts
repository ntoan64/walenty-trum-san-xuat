// Khôi phục từ 1 file sao lưu .json.gz (tải ở trang Nhân viên → Sao lưu).
//   npx tsx scripts/restore.mts <file.json.gz>            → chỉ xem trong file có gì
//   npx tsx scripts/restore.mts <file.json.gz> --apply    → GHI ĐÈ dữ liệu hiện tại bằng bản sao lưu
// Trước khi ghi đè, tự sao lưu dữ liệu hiện tại thêm 1 bản (phòng khôi phục nhầm).
import { readFileSync } from "node:fs";
import { getDb } from "../server/db.ts";
import { createBackup, parseBackup } from "../server/backup.ts";

const [file, flag] = process.argv.slice(2);
if (!file) { console.log("Cách dùng: npx tsx scripts/restore.mts <file.json.gz> [--apply]"); process.exit(1); }
const data = parseBackup(readFileSync(file));
console.log(`Bản sao lưu DB "${data.db}" lúc ${data.at.toISOString()}`);
for (const [k, v] of Object.entries(data.collections)) console.log(`  ${k.padEnd(20)} ${v.length}`);
if (flag !== "--apply") { console.log("\n(Chỉ xem. Thêm --apply để khôi phục.)"); process.exit(0); }

const db = await getDb();
console.log(`\nSao lưu dữ liệu hiện tại của "${db.databaseName}" trước khi ghi đè…`);
console.log("  →", (await createBackup("Trước khi khôi phục")).id);
for (const [name, docs] of Object.entries(data.collections)) {
  await db.collection(name).deleteMany({});
  if (docs.length) await db.collection(name).insertMany(docs);
  console.log(`  khôi phục ${name}: ${docs.length}`);
}
// đổi version để mọi máy tải lại dữ liệu mới
await db.collection<{ _id: string }>("meta").updateOne({ _id: "meta" }, { $inc: { version: 1 } });
console.log("Xong.");
process.exit(0);
