# Walenty Trùm Sản Xuất

| Thư mục | Nội dung |
|---|---|
| `giaodien/` | Giao diện Next.js 16 + Tailwind + shadcn/ui, API route (`app/api/*`) |
| `chucnang/core/` | Nghiệp vụ dùng chung: kiểu dữ liệu, phân quyền, giá BQ, cân số lượng, thao tác (`actions.ts`), ràng buộc (`LIMITS`), test Vitest |
| `chucnang/server/` | MongoDB (`db.ts`), đăng nhập + mật khẩu scrypt + phiên (`auth.ts`), đọc/ghi dữ liệu + lịch sử (`store.ts`), chống spam (`guard.ts`) |
| `chucnang/.env` | `MONGODB_URI` (không commit file này) |

## Chạy

```bash
cd giaodien && npm install && npm run dev     # http://localhost:3000
cd chucnang && npm install && npm test        # test nghiệp vụ
```

- **Điện thoại**: cùng WiFi với máy tính, mở `http://<IP máy tính>:3000` (xem IP bằng `ipconfig`). Lần đầu Windows có thể hỏi cho phép Node.js qua tường lửa → chọn Cho phép (mạng riêng).
- Database trống thì lần đầu mở sẽ tự tạo 3 tài khoản (admin / huynh / qc). Xưởng, phụ liệu, sản phẩm do người dùng tự thêm.
- Tài khoản admin ban đầu: `admin` / `walenty@2026` (hoặc giá trị `ADMIN_PASSWORD` trong `.env`). **Đổi ngay** ở trang Thông tin tài khoản.
- Huỳnh và Team QC chưa có mật khẩu: admin vào trang Nhân viên → Cấp MK.

## Quyền

| | Phan Anh (admin) | Huỳnh (phó kho) | Team QC |
|---|---|---|---|
| Kho, sản phẩm, lệnh, duyệt, đóng lệnh | ✓ | ✓ | |
| QC, phiếu sửa | ✓ | ✓ | ✓ |
| Xem giá | ✓ | ✓ | ✗ |
| Xưởng Bot (xem, soạn tin) | ✓ | ✓ | ✗ |
| Cấp tài khoản / mật khẩu | ✓ | | |
| Lịch sử thao tác | mọi người | mọi người | của mình |
