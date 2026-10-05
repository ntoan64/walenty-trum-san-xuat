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

export interface Product {
  id: string
  sku: string
  name: string
  laborCost: number
  bom: BomLine[]
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
  items?: { size: string; defect: string; qty: number }[] // chi tiết theo size
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
