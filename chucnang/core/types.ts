// Kiểu dữ liệu theo SPEC.md mục 5. Id là string để dùng chung cho dữ liệu mẫu và MongoDB.

export type Role = 'quanly' | 'kho' | 'qc'

export interface User {
  id: string
  name: string
  phone: string
  email?: string
  username?: string // tên đăng nhập, admin cấp
  hasPassword?: boolean // chỉ gửi cho giao diện
  passwordHash?: string // CHỈ có ở server, bị xóa trước khi gửi xuống trình duyệt
  role: Role
  title?: string // chức danh hiển thị, vd "Quản lý kho"
  avatar?: string // ảnh đại diện (data URL nhỏ ~160px; sau này đổi sang URL Cloudinary)
  telegramChatId?: string
  active: boolean
  createdAt: Date
}

export interface Workshop {
  id: string
  name: string
  area: string
  contactName: string
  phone: string
  active: boolean
  address?: string
  note?: string
  aliases?: string[] // tên gọi khác (trong file tính giá, Sapo…) để khớp tự động
  rates?: WorkshopRate[] // bảng giá gia công
}

export interface WorkshopRate {
  item: string // loại sản phẩm / công đoạn
  price?: number
  minQty?: number
  invoice?: boolean // xuất được hóa đơn
  note?: string
}

// Bảng tính giá 1 sản phẩm (theo file TÍNH GIÁ SP): giá vốn = công may + vải chính + vải lót + phụ liệu + khác
export interface Costing {
  labor: number // công may
  workshop?: string // id xưởng may
  workshopName?: string
  sewType?: string // loại may
  fabric?: { name?: string; qty: number; price: number } // vải chính: định lượng (m) × giá/m
  lining?: { name?: string; qty: number; price: number } // vải lót
  acc?: { tag?: number; logo?: number; extra?: number; buttons?: number; fusing?: number } // tag, thêu logo, phụ kiện kèm, cúc, ép keo
  zipper?: number // dây kéo (ghi chú, file không cộng vào phụ liệu)
  other?: number // chi phí khác (vd khăn tặng kèm)
  ratio?: number // tỉ lệ cost mong muốn (vd 0.32)
  listPrice?: number // giá áp dụng (đã gồm VAT)
  rating?: string // đánh giá
  updated?: string // ngày cập nhật giá (yyyy-mm-dd)
}

// Tình trạng mã hàng: đang dùng / tạm ngưng (không dùng cho lệnh mới) / ngừng hẳn (không nhập, không dùng)
export type ItemStatus = "active" | "paused" | "discontinued"

export type MaterialCategory = "vai" | "nut" | "chi" | "nhan" | "khoa" | "khac"

export interface Material {
  id: string
  code: string
  category: MaterialCategory
  name: string
  unit: string
  stock: number
  avgPrice: number
  totalImportQty: number
  totalImportCost: number
  minStock: number // ngưỡng báo hết: tồn dưới mức này → báo sắp hết
  okStock?: number // ngưỡng báo đủ: nhập lên tới mức này → báo đã đủ (mặc định 130% ngưỡng hết)
  lowAlertedAt?: Date | null
  status: ItemStatus
  supplier?: string // nhà cung cấp
  supplierCode?: string // mã của nhà cung cấp (vd FP07997_40#)
  note?: string // đặc tính, dùng may sản phẩm nào
  image?: string // ảnh phụ liệu (Cloudinary)
}

export interface MaterialTxn {
  id: string
  material: string
  type: 'in' | 'out' | 'adjust'
  qty: number
  price?: number
  supplier?: string
  order?: string
  reason?: string
  stockAfter: number
  avgAfter: number
  by: string
  at: Date
}

export interface BomLine {
  material: string
  qtyPerUnit: number
}

// Mỗi size một mã SKU riêng (giống phiên bản trên Sapo)
// Phiên bản sản phẩm theo cấu trúc Sapo: size × màu, mỗi phiên bản 1 SKU
export interface ProductVariant {
  size: string
  color?: string
  sku: string
  barcode?: string
  price?: number // giá bán lẻ
  cost?: number // giá nhập (Sapo)
  image?: string // link ảnh (Sapo)
  stock?: number // tồn kho trên Sapo (cộng các chi nhánh) lúc nhập file
  stocks?: Record<string, number> // tồn theo chi nhánh Sapo (CN1, CN2…)
  prices?: Record<string, number> // các bảng giá khác: bán buôn, EOSS, TMĐT, Shopee…
}

export interface Product {
  id: string
  sku: string // mã chung của mẫu
  name: string
  laborCost: number
  bom: BomLine[] // định mức chung (mọi màu)
  bomByColor?: Record<string, BomLine[]> // định mức riêng theo màu (vải khác màu); không có thì dùng định mức chung
  costing?: Record<string, Costing> // bảng tính giá: "" = chung, hoặc theo màu
  variants?: ProductVariant[]
  category?: string // loại sản phẩm (BLAZER, QUẦN…)
  tags?: string[] // vd "Không nhận sửa - custom"
  brand?: string // nhãn hiệu (Sapo)
  source?: "sapo"
  syncedAt?: Date // lần đồng bộ Sapo gần nhất
  status: ItemStatus
}

export interface FinishedTxn {
  id: string
  product: string
  qty: number
  order: string
  repair?: string
  note?: string // vd "Trừ do hủy lệnh"
  by: string
  at: Date
}

export type Step = 'cut' | 'sew' | 'qc' | 'done'

// Lệnh sản xuất chia theo size
export interface SizeQty {
  size: string
  qty: number
}

// Một dòng lỗi QC tự nhập: loại lỗi, size, mô tả, số lượng
export interface DefectLine {
  kind: "sua" | "vai" | "hong"
  size: string
  defect: string
  qty: number
  photos?: string[] // ảnh lỗi (link Cloudinary)
}

export interface BatchQC {
  pass: number
  sua: number
  vai: number
  hong: number
  defect: string // tóm tắt lỗi chính
  lines?: DefectLine[]
  photos: string[]
  by: string
  at: Date
}

export interface Batch {
  id: string
  receivedAt: Date
  received: number
  sizes?: SizeQty[] // nhận theo size (lệnh có size)
  qc?: BatchQC | null
}

export interface ProductionOrder {
  id: string
  code: string
  product: string
  workshop: string
  qty: number
  dueAt: Date
  step: Step
  unitCost: number
  color?: string // màu (sản phẩm nhiều màu)
  sizes?: SizeQty[]
  loss: number
  lossApproved: boolean
  lossApprovedBy?: string
  batches: Batch[]
  createdBy: string
  createdAt: Date
  closedAt?: Date | null
  closedBy?: string
  cancelled?: { at: Date; by: string; reason: string } | null // admin hủy lệnh (không xóa cứng)
}

export type RepairStatus = 'sent' | 'received' | 'returned' | 'closed'

export interface RepairTicket {
  id: string
  code: string
  order: string
  workshop: string
  qty: number
  defect: string
  photos: string[]
  round: number
  sentAt: Date
  dueAt: Date
  status: RepairStatus
  items?: { size: string; defect: string; qty: number; photos?: string[] }[] // chi tiết theo size
  requc?: { pass: number; again: number; hong: number; by: string; at: Date } | null
  history: { at: Date; by: string; text: string }[]
  parent?: string
}

export type EventType = 'issue' | 'receive' | 'pass' | 'sua' | 'vai' | 'hong' | 'back' | 'loss'

export interface ProdEvent {
  id: string
  type: EventType
  order: string
  workshop: string
  product: string
  qty: number
  round: number
  by: string
  at: Date
}

export interface Notification {
  id: string
  roles: Role[]
  users?: string[] // gửi riêng cho từng người (id). Có thì ưu tiên hơn roles khi hiển thị
  from?: string // người soạn, không có = bot tự gửi
  text: string
  sentAt: Date
  ok: boolean
  error?: string
}

// Lịch sử thao tác: ai làm gì, lúc nào
export interface AuditEntry {
  id: string
  at: Date
  userId: string
  userName: string
  action: string // tên thao tác, vd "importBatch"
  label: string // tên tiếng Việt, vd "Nhập kho"
  detail: string // kết quả, vd "Đã nhập kho 2 dòng"
  ref?: string // mã liên quan (lệnh, phiếu…)
}

// Đồ khách gửi sửa: cửa hàng nhận từ khách → gửi xưởng → xưởng trả về → trả khách
export type CustomerRepairStatus = "received" | "sent" | "returned" | "done"

export interface CustomerRepair {
  id: string
  code: string // KS-001
  customerName: string
  customerPhone: string
  item: string // sản phẩm, vd "Áo sơ mi SM01 trắng"
  size: string
  request: string // khách muốn sửa gì
  note?: string
  receivedAt: Date
  promisedAt: Date // hẹn trả khách
  workshop?: string
  sentAt?: Date
  returnedAt?: Date
  doneAt?: Date
  status: CustomerRepairStatus
  history: { at: Date; by: string; text: string }[]
}
