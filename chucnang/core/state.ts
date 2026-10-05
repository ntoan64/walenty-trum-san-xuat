// Toàn bộ dữ liệu nghiệp vụ mà các thao tác (actions) đọc / ghi
import type {
  CustomerRepair, FinishedTxn, Material, MaterialTxn, Notification, ProdEvent, Product, ProductionOrder, RepairTicket, User, Workshop,
} from "./types";

export interface DataState {
  users: User[];
  workshops: Workshop[];
  materials: Material[];
  materialTxns: MaterialTxn[];
  products: Product[];
  finishedTxns: FinishedTxn[];
  orders: ProductionOrder[];
  repairs: RepairTicket[];
  events: ProdEvent[];
  notifications: Notification[];
  customerRepairs: CustomerRepair[];
  seq: { order: number; repair: number; id: number; customer?: number };
}

// Tên collection MongoDB cho từng phần của state
export const COLLECTIONS = {
  users: "users",
  workshops: "workshops",
  materials: "materials",
  materialTxns: "material_txns",
  products: "products",
  finishedTxns: "finished_txns",
  orders: "orders",
  repairs: "repairs",
  events: "events",
  notifications: "notifications",
  customerRepairs: "customer_repairs",
} as const satisfies Record<Exclude<keyof DataState, "seq">, string>;

export type CollectionKey = keyof typeof COLLECTIONS;

// Dữ liệu ban đầu khi database còn trống: chỉ 3 người dùng, còn lại người dùng tự tạo
export function createBaseState(now = new Date()): DataState {
  return {
    users: [
      { id: "u1", name: "Phan Anh", title: "Quản lý kho", username: "admin", phone: "0901 234 567", role: "quanly", active: true, createdAt: now },
      { id: "u2", name: "Huỳnh", title: "Phó kho", username: "huynh", phone: "0902 345 678", role: "kho", active: true, createdAt: now },
      { id: "u3", name: "Team QC", title: "QC", username: "qc", phone: "0903 456 789", role: "qc", active: true, createdAt: now },
    ],
    workshops: [], // người dùng tự thêm ở trang Xưởng may
    materials: [], materialTxns: [], products: [], finishedTxns: [], orders: [], repairs: [], events: [], notifications: [], customerRepairs: [],
    seq: { order: 1, repair: 1, id: 100, customer: 1 },
  };
}
