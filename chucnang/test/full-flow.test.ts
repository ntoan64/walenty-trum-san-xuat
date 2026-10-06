/**
 * Test tổng hợp toàn bộ luồng trên MongoDB THẬT nhưng ở database riêng `<tên>_test`
 * (cùng cụm Atlas trong chucnang/.env). Không đụng dữ liệu đang dùng; chạy xong tự xóa.
 *
 *   cd chucnang && npm run test:full
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import type { MongoClient } from "mongodb";
import type { User } from "../core/types";

// ---- chuyển sang database test TRƯỚC khi nạp code server ----
process.loadEnvFile(path.resolve(__dirname, "../.env"));
const realUri = process.env.MONGODB_URI!;
const u = new URL(realUri);
const realDb = u.pathname.replace("/", "") || "test";
u.pathname = `/${realDb}_test`;
process.env.MONGODB_URI = u.toString();
process.env.ADMIN_PASSWORD = "admin-test-123";

const { getDb } = await import("../server/db");
const { hashPassword, verifyPassword } = await import("../server/auth");
const { loadState, runAction, toClient, listAudit } = await import("../server/store");
const { rateLimit, isDuplicate } = await import("../server/guard");
const { calcBalance, canClose, isBalanced } = await import("../core/orders");

const dateIn = (days: number) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
let admin: User, kho: User, qc: User;

async function state() {
  return (await loadState()).state;
}
async function ok(user: User, name: string, ...args: unknown[]) {
  const r = await runAction(user, name, args);
  if (!r.ok) throw new Error(`${name}: ${r.error}`);
  return r;
}
async function fails(user: User, name: string, ...args: unknown[]) {
  const r = await runAction(user, name, args);
  expect(r.ok, `${name} lẽ ra phải bị từ chối`).toBe(false);
  return r.ok ? "" : r.error;
}

beforeAll(async () => {
  const db = await getDb();
  // Chặn tuyệt đối việc chạy nhầm lên database thật
  expect(db.databaseName).toBe(`${realDb}_test`);
  expect(db.databaseName.endsWith("_test")).toBe(true);
  await db.dropDatabase();
});

afterAll(async () => {
  const db = await getDb();
  if (db.databaseName.endsWith("_test")) await db.dropDatabase();
  const g = globalThis as unknown as { __mongo?: Promise<MongoClient> };
  await (await g.__mongo)?.close();
});

describe("1. Khởi tạo + đăng nhập", () => {
  it("database trống tự tạo đúng 3 tài khoản, chưa có xưởng", async () => {
    const s = await state();
    expect(s.users.map(x => x.username)).toEqual(["admin", "huynh", "qc"]);
    expect(s.workshops).toHaveLength(0);
    [admin, kho, qc] = s.users;
    expect(admin.role).toBe("quanly");
    expect(qc.role).toBe("qc");
  });

  it("mật khẩu admin băm scrypt, đúng thì qua, sai thì chặn", async () => {
    expect(admin.passwordHash).toMatch(/^scrypt\$/);
    expect(await verifyPassword("admin-test-123", admin.passwordHash)).toBe(true);
    expect(await verifyPassword("sai-mat-khau", admin.passwordHash)).toBe(false);
    expect(kho.passwordHash).toBeUndefined(); // chưa cấp thì chưa đăng nhập được
  });

  it("dữ liệu gửi xuống trình duyệt không có hash mật khẩu", async () => {
    const c = toClient(await state());
    expect(c.users.every(x => !("passwordHash" in x))).toBe(true);
    expect(c.users.find(x => x.username === "admin")?.hasPassword).toBe(true);
  });

  it("chỉ admin cấp mật khẩu; phó kho bị chặn", async () => {
    const hash = await hashPassword("qc-pass-123");
    await fails(kho, "setPassword", { userId: qc.id, passwordHash: hash });
    await ok(admin, "setPassword", { userId: qc.id, passwordHash: hash });
    const q = (await state()).users.find(x => x.id === qc.id)!;
    expect(await verifyPassword("qc-pass-123", q.passwordHash)).toBe(true);
  });
});

describe("2. Phân quyền", () => {
  it("QC không nhập kho, không tạo lệnh, không gửi thông báo, không cấp tài khoản", async () => {
    expect(await fails(qc, "importBatch", { supplier: "", lines: [] })).toMatch(/quyền/);
    expect(await fails(qc, "createOrder", { productId: "x", workshopId: "x", sizes: [], dueDate: dateIn(3) })).toMatch(/quyền/);
    expect(await fails(qc, "sendMessage", { userIds: [admin.id], text: "x" })).toMatch(/quyền/);
    expect(await fails(qc, "toggleUser", admin.id)).toMatch(/quyền/);
  });
  it("thao tác lạ bị từ chối", async () => {
    expect(await fails(admin, "xoaHetDuLieu")).toMatch(/không tồn tại/);
  });
});

describe("3. Xưởng, phụ liệu, sản phẩm", () => {
  it("tự tạo xưởng, chặn trùng tên và SĐT sai", async () => {
    await ok(admin, "createWorkshop", { name: "Xưởng A", area: "Quận 12", contactName: "Cô Sáu", phone: "0903 112 456" });
    expect(await fails(admin, "createWorkshop", { name: "xưởng a", area: "", contactName: "", phone: "0903112456" })).toMatch(/đã có/);
    expect(await fails(admin, "createWorkshop", { name: "Xưởng B", area: "", contactName: "", phone: "123" })).toMatch(/điện thoại/);
  });

  it("phiếu nhập nhiều dòng tạo phụ liệu mới với mã tự sinh + giá BQ đúng", async () => {
    await ok(kho, "importBatch", {
      supplier: "Phú Thịnh",
      lines: [
        { newMaterial: { name: "Vải kate trắng", unit: "mét", category: "vai", minStock: 50, okStock: 200 }, qty: 100, price: 50000 },
        { newMaterial: { name: "Nút nhựa 12mm", unit: "cái", category: "nut", minStock: 500, okStock: 2000 }, qty: 3000, price: 300 },
        { newMaterial: { name: "Chỉ trắng", unit: "cuộn", category: "chi", minStock: 10, okStock: 30 }, qty: 40, price: 18000 },
      ],
    });
    const s = await state();
    expect(s.materials.map(m => m.code)).toEqual(["VAI-01", "NUT-01", "CHI-01"]);
    const vai = s.materials[0];
    await ok(kho, "importMaterial", { materialId: vai.id, qty: 300, price: 40000, supplier: "" });
    const v2 = (await state()).materials[0];
    expect(v2.avgPrice).toBe(42500); // (100×50.000 + 300×40.000) ÷ 400
    expect(v2.stock).toBe(400);
  });

  it("ràng buộc: số lượng / đơn giá quá lớn, ngưỡng sai đều bị chặn", async () => {
    const s = await state();
    expect(await fails(kho, "importMaterial", { materialId: s.materials[0].id, qty: 5_000_000, price: 1, supplier: "" })).toMatch(/tối đa/);
    expect(await fails(kho, "importMaterial", { materialId: s.materials[0].id, qty: 1, price: 9e12, supplier: "" })).toMatch(/tối đa/);
    expect(await fails(kho, "setThresholds", s.materials[0].id, { minStock: 100, okStock: 50 })).toMatch(/lớn hơn/);
  });

  it("thêm sản phẩm với định mức; giá vốn tính đúng", async () => {
    const s = await state();
    const [vai, nut, chi] = s.materials;
    await ok(admin, "createProduct", { sku: "sm01", name: "Áo sơ mi trắng", laborCost: 45000, bom: [{ material: vai.id, qtyPerUnit: 1.3 }, { material: nut.id, qtyPerUnit: 8 }, { material: chi.id, qtyPerUnit: 0.1 }] });
    expect(await fails(admin, "createProduct", { sku: "SM01", name: "Trùng", laborCost: 1, bom: [{ material: vai.id, qtyPerUnit: 1 }] })).toMatch(/đã có/);
    expect((await state()).products[0].sku).toBe("SM01");
    const pid = (await state()).products[0].id;
    await ok(admin, "setProductVariants", pid, [{ size: "s", sku: "pvn5748" }, { size: "M", sku: "PVN5749" }]);
    expect((await state()).products[0].variants).toEqual([{ size: "S", sku: "PVN5748" }, { size: "M", sku: "PVN5749" }]);
    expect(await fails(admin, "setProductVariants", pid, [{ size: "S", sku: "A1" }, { size: "S", sku: "A2" }])).toMatch(/trùng/);
    expect(await fails(qc, "setProductVariants", pid, [])).toMatch(/quyền/);
  });
});

describe("4. Lệnh sản xuất trọn vòng", () => {
  let orderId = "";

  it("tạo lệnh theo size + ngày dự kiến, xuất phụ liệu theo định mức", async () => {
    const s = await state();
    const r = await ok(admin, "createOrder", { productId: s.products[0].id, workshopId: s.workshops[0].id, sizes: [{ size: "s", qty: 10 }, { size: "M", qty: 20 }, { size: "L", qty: 10 }], dueDate: dateIn(5) });
    orderId = r.ok ? r.id! : "";
    expect(orderId).toBe("LSX-0001");
    const s2 = await state();
    const o = s2.orders[0];
    expect(o.qty).toBe(40);
    expect(o.sizes?.map(x => x.size)).toEqual(["S", "M", "L"]);
    expect(s2.materials[0].stock).toBe(348); // 400 − 40 × 1,3
    expect(o.unitCost).toBeGreaterThan(45000);
  });

  it("chặn ngày quá khứ, lệnh quá lớn, xưởng đang có lệnh thì không ngừng được", async () => {
    const s = await state();
    expect(await fails(admin, "createOrder", { productId: s.products[0].id, workshopId: s.workshops[0].id, sizes: [{ size: "M", qty: 1 }], dueDate: "2020-01-01" })).toMatch(/hôm nay/);
    expect(await fails(admin, "createOrder", { productId: s.products[0].id, workshopId: s.workshops[0].id, sizes: [{ size: "M", qty: 200_000 }], dueDate: dateIn(3) })).toMatch(/tối đa/);
    expect(await fails(admin, "toggleWorkshop", s.workshops[0].id)).toMatch(/lệnh đang chạy/);
  });

  it("cắt → nhận hàng → QC theo size tự tạo phiếu sửa + nhập kho thành phẩm", async () => {
    await ok(kho, "confirmCut", orderId);
    expect(await fails(kho, "receive", orderId, 38)).toMatch(/theo từng size/); // lệnh có size thì phải nhập theo size
    expect(await fails(kho, "receive", orderId, { sizes: [{ size: "M", qty: 21 }] })).toMatch(/còn thiếu 20/);
    await ok(kho, "receive", orderId, { sizes: [{ size: "S", qty: 10 }, { size: "M", qty: 18 }, { size: "L", qty: 10 }] });
    const { sizeProgress } = await import("../core/orders");
    expect(sizeProgress((await state()).orders[0]).find(x => x.size === "M")?.missing).toBe(2); // QC thấy xưởng còn thiếu 2 cái size M
    const b = (await state()).orders[0].batches[0];
    expect(await fails(qc, "saveQC", orderId, b.id, { lines: [{ kind: "sua", size: "XL", defect: "Bỏ mũi", qty: 1 }] })).toMatch(/không có trong lệnh/);
    expect(await fails(qc, "saveQC", orderId, b.id, { lines: [{ kind: "sua", size: "S", defect: "Bỏ mũi", qty: 11 }] })).toMatch(/chỉ nhận 10/);
    expect(await fails(qc, "saveQC", orderId, b.id, { lines: [{ kind: "sua", size: "M", defect: " ", qty: 1 }] })).toMatch(/mô tả/);
    await ok(qc, "saveQC", orderId, b.id, { lines: [{ kind: "sua", size: "M", defect: "Bỏ mũi ở tay", qty: 3 }, { kind: "vai", size: "S", defect: "Lỗi sợi", qty: 1 }] });
    const s = await state();
    expect(s.orders[0].batches[0].qc?.pass).toBe(34);
    expect(s.repairs).toHaveLength(1);
    expect(s.repairs[0].code).toBe("R-001");
    expect(s.repairs[0].items).toEqual([{ size: "M", defect: "Bỏ mũi ở tay", qty: 3 }]);
    expect(s.finishedTxns.reduce((t, x) => t + x.qty, 0)).toBe(34);
  });

  it("hao hụt cần duyệt; chưa đủ điều kiện thì không đóng được", async () => {
    await ok(kho, "reportLoss", orderId, 2);
    expect(await fails(admin, "closeOrder", orderId)).toMatch(/điều kiện/);
    await ok(admin, "approveLoss", orderId);
  });

  it("phiếu sửa: xưởng nhận → trả lại → QC lại → đóng lệnh, số lượng cân", async () => {
    const r = (await state()).repairs[0];
    expect(await fails(qc, "repairStatus", r.id, "returned")).toMatch(/chưa nhận/);
    await ok(qc, "repairStatus", r.id, "received");
    await ok(qc, "repairStatus", r.id, "returned");
    expect(await fails(qc, "requc", r.id, { pass: 1, again: 0, hong: 0 })).toMatch(/phải bằng 3/);
    await ok(qc, "requc", r.id, { pass: 3, again: 0, hong: 0 });
    const s = await state();
    const o = s.orders[0];
    const bal = calcBalance(o, s.repairs.filter(x => x.order === o.id));
    expect(isBalanced(o, bal)).toBe(true);
    expect(bal).toMatchObject({ pass: 37, scrap: 1, loss: 2, inRepair: 0, pendingQC: 0, notReturned: 0 });
    expect(canClose(o, bal)).toBe(true);
    await ok(admin, "closeOrder", orderId);
    expect((await state()).orders[0].step).toBe("done");
  });
});

describe("5. Ngưỡng báo hết / báo đủ", () => {
  it("dưới ngưỡng hết báo 1 lần, nhập lên ngưỡng đủ báo đã đủ", async () => {
    const s = await state();
    const vai = s.materials[0]; // đang 348 mét
    await ok(admin, "setThresholds", vai.id, { minStock: 400, okStock: 600 });
    let s2 = await state();
    expect(s2.notifications[0].text).toMatch(/báo hết/);
    const before = s2.notifications.length;
    await ok(kho, "importMaterial", { materialId: vai.id, qty: 100, price: 40000, supplier: "" }); // 448: vẫn chưa đủ
    s2 = await state();
    expect(s2.notifications.length).toBe(before); // không spam thêm
    await ok(kho, "importMaterial", { materialId: vai.id, qty: 200, price: 40000, supplier: "" }); // 648 ≥ 600
    s2 = await state();
    expect(s2.notifications[0].text).toMatch(/đã đủ hàng/);
  });
});

describe("6. Đồ khách gửi sửa", () => {
  it("QC nhận đồ → gửi xưởng → xưởng trả → trả khách, có ghi chú", async () => {
    const r = await ok(qc, "createCustomerRepair", { customerName: "Chị Mai", customerPhone: "0909 123 456", item: "Đầm lụa đen", size: "m", request: "Lên lai 2cm", promisedDate: dateIn(4) });
    const id = r.ok ? r.id! : "";
    expect(id).toBe("KS-001");
    expect(await fails(qc, "customerRepairDone", id)).toMatch(/chưa trả/);
    await ok(qc, "noteCustomerRepair", id, "Khách gọi đổi sang lên lai 3cm");
    await ok(qc, "sendCustomerRepair", id, (await state()).workshops[0].id);
    await ok(qc, "customerRepairBack", id);
    await ok(qc, "customerRepairDone", id);
    const cr = (await state()).customerRepairs[0];
    expect(cr.status).toBe("done");
    expect(cr.size).toBe("M");
    expect(cr.history.map(h => h.text).join(" | ")).toMatch(/Lên lai 2cm.*lên lai 3cm.*Gửi Xưởng A.*trả khách/);
  });
});

describe("7. Thông báo, hồ sơ, tài khoản", () => {
  it("gửi thông báo riêng cho từng người; giới hạn độ dài", async () => {
    await ok(admin, "sendMessage", { userIds: [kho.id, qc.id], text: "Chiều kiểm kê" });
    const n = (await state()).notifications[0];
    expect(n.users).toEqual([kho.id, qc.id]);
    expect(n.from).toBe("Phan Anh");
    expect(await fails(admin, "sendMessage", { userIds: [kho.id], text: "x".repeat(1001) })).toMatch(/tối đa/);
  });

  it("tự sửa hồ sơ + ảnh đại diện; ảnh quá lớn bị chặn", async () => {
    await ok(qc, "updateProfile", { name: "Team QC", phone: "0903 456 789", avatar: "data:image/jpeg;base64,AAAA" });
    expect((await state()).users.find(x => x.id === qc.id)?.avatar).toMatch(/^data:image/);
    expect(await fails(qc, "updateProfile", { name: "Team QC", phone: "0903 456 789", avatar: "data:image/jpeg;base64," + "A".repeat(250_000) })).toMatch(/quá lớn/);
  });

  it("admin cấp tài khoản mới; không tự khóa mình được", async () => {
    await ok(admin, "createAccount", { name: "Thảo", username: "Thao.QC", phone: "0911 222 333", role: "qc", title: "QC", passwordHash: await hashPassword("abcdef") });
    expect((await state()).users.find(x => x.username === "thao.qc")).toBeTruthy();
    expect(await fails(admin, "createAccount", { name: "Trùng", username: "thao.qc", phone: "", role: "qc", title: "", passwordHash: "x" })).toMatch(/đã có/);
    expect(await fails(admin, "toggleUser", admin.id)).toMatch(/tự khóa/);
  });
});

describe("8. Lịch sử, đồng thời, chống spam, lưu bền", () => {
  it("lịch sử ghi đủ từng thao tác kèm người làm", async () => {
    const rows = await listAudit({ limit: 1000 });
    const labels = new Set(rows.map(r => r.label));
    for (const l of ["Nhập kho", "Thêm sản phẩm", "Tạo lệnh sản xuất", "Lưu kết quả QC", "Duyệt hao hụt", "Đóng lệnh", "Nhận đồ khách gửi sửa", "Đặt mật khẩu"]) {
      expect(labels.has(l), `thiếu lịch sử "${l}"`).toBe(true);
    }
    expect((await listAudit({ userId: qc.id })).every(r => r.userId === qc.id)).toBe(true);
  });

  it("5 người tạo cùng lúc không mất dữ liệu (khóa lạc quan)", async () => {
    const results = await Promise.all([1, 2, 3, 4, 5].map(i =>
      runAction(admin, "createWorkshop", [{ name: `Xưởng song song ${i}`, area: "", contactName: "", phone: "0900000000" }])));
    expect(results.filter(r => r.ok)).toHaveLength(5);
    const ws = (await state()).workshops.filter(w => w.name.startsWith("Xưởng song song"));
    expect(ws).toHaveLength(5);
    expect(new Set(ws.map(w => w.id)).size).toBe(5);
  });

  it("chống spam: giới hạn tần suất và bỏ thao tác trùng", () => {
    const key = `test:${Date.now()}`;
    const allowed = Array.from({ length: 5 }, () => rateLimit(key, 3, 60_000));
    expect(allowed).toEqual([true, true, true, false, false]);
    const dup = `dup:${Date.now()}`;
    expect(isDuplicate(dup)).toBe(false);
    expect(isDuplicate(dup)).toBe(true);
  });

  it("dữ liệu đọc lại từ Mongo khớp (ngày giờ vẫn là Date)", async () => {
    const s = await state();
    expect(s.orders[0].createdAt).toBeInstanceOf(Date);
    expect(s.seq.order).toBe(2);
    expect(s.seq.repair).toBe(2);
    expect(s.materialTxns.length).toBeGreaterThanOrEqual(8);
  });
});
