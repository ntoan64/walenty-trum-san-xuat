import type { Role } from './types'

// Team sản xuất: Phan Anh (quản lý kho), Huỳnh (phó kho), Team QC. Team Sale cửa hàng: chỉ phần đồ khách gửi sửa
export const STAFF: Role[] = ['quanly', 'kho', 'qc']
export const ROLES: Role[] = [...STAFF, 'sale']

export const ROLE_LABEL: Record<Role, string> = {
  quanly: 'Quản lý kho',
  kho: 'Phó kho',
  qc: 'QC',
  sale: 'Sale cửa hàng',
}

// Màn hình được xem
export type Screen =
  | 'overview' | 'orders' | 'qc' | 'materials' | 'products'
  | 'finished' | 'workshops' | 'reports' | 'users' | 'history' | 'customer' | 'stats'

const FULL: Role[] = ['quanly', 'kho']

export const SCREEN_ROLES: Record<Screen, Role[]> = {
  overview: STAFF,
  orders: STAFF,
  qc: STAFF,
  materials: FULL,
  products: FULL,
  finished: FULL,
  workshops: STAFF,
  reports: STAFF,
  users: ['quanly'],
  history: ROLES, // ai cũng xem lịch sử của mình
  customer: ROLES,
  stats: FULL, // có giá tiền, QC không xem
}

// Thao tác ghi dữ liệu, API phải kiểm tra lại bằng can()
export type Action =
  | 'price.view' | 'notify.view' | 'audit.all'
  | 'material.import' | 'material.adjust' | 'material.manage' | 'product.manage'
  | 'order.create' | 'order.cut' | 'order.receive'
  | 'qc.save' | 'loss.report' | 'loss.approve' | 'order.close'
  | 'repair.status' | 'repair.requc'
  | 'report.send' | 'user.manage' | 'notify.send' | 'workshop.manage' | 'customer.repair' | 'customer.qc' | 'order.admin'

// Quản lý kho và phó kho dùng toàn bộ chức năng; QC chỉ làm phần QC và không xem giá
export const ACTION_ROLES: Record<Action, Role[]> = {
  'price.view': FULL,
  'notify.view': FULL, // QC không xem, không soạn tin Xưởng Bot
  'audit.all': FULL, // xem lịch sử của mọi người; QC chỉ xem của mình
  'material.import': FULL,
  'material.adjust': FULL,
  'material.manage': FULL,
  'product.manage': FULL,
  'order.create': FULL,
  'order.cut': FULL,
  'order.receive': FULL,
  'qc.save': STAFF,
  'loss.report': FULL,
  'loss.approve': FULL,
  'order.close': FULL,
  'repair.status': STAFF,
  'repair.requc': STAFF,
  'report.send': FULL,
  'user.manage': ['quanly'], // chỉ admin cấp tài khoản, mật khẩu
  'notify.send': FULL,
  'workshop.manage': FULL,
  'order.admin': ['quanly'], // chỉ admin sửa / hủy lệnh
  'customer.repair': ROLES, // sale tạo yêu cầu + cửa hàng xác nhận hoàn thành
  'customer.qc': STAFF, // QC nhận hàng, gửi xưởng, kiểm tra, trả sale
}

export const can = (role: Role, action: Action) => ACTION_ROLES[action].includes(role)
export const canView = (role: Role, screen: Screen) => SCREEN_ROLES[screen].includes(role)
