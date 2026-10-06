import { describe, expect, it } from 'vitest'
import { applyImport, applyIssue } from './inventory'
import { calcBalance, canClose, isBalanced, validateQC } from './orders'
import type { Material, ProductionOrder, RepairTicket } from './types'

const mat = (): Material => ({
  id: 'm', code: 'V', name: 'Vải', unit: 'mét', stock: 0, avgPrice: 0,
  totalImportQty: 0, totalImportCost: 0, minStock: 0, status: "active", category: "vai",
})

describe('giá bình quân', () => {
  it('= tổng tiền ÷ tổng số lượng, xuất kho không đổi giá', () => {
    const m = mat()
    applyImport(m, 100, 50000)
    applyImport(m, 300, 40000)
    expect(m.avgPrice).toBe(42500)
    applyIssue(m, 200)
    expect(m.avgPrice).toBe(42500)
    expect(m.stock).toBe(200)
  })
})

describe('cân số lượng lệnh', () => {
  const now = new Date()
  const order: ProductionOrder = {
    id: 'o', code: 'LSX', product: 'p', workshop: 'w', qty: 10, dueAt: now, step: 'qc',
    unitCost: 0, loss: 1, lossApproved: false, createdBy: 'u', createdAt: now,
    batches: [{ id: 'b', receivedAt: now, received: 9,
      qc: { pass: 8, sua: 1, vai: 0, hong: 0, defect: 'Bỏ mũi', photos: [], by: 'u', at: now } }],
  }
  const repair: RepairTicket = {
    id: 'r', code: 'R', order: 'o', workshop: 'w', qty: 1, defect: 'Bỏ mũi', photos: [], round: 1,
    sentAt: now, dueAt: now, status: 'sent', history: [],
  }

  it('nhận 9, QC 8 pass + 1 sửa, hao hụt 1 → cân bằng nhưng chưa đóng được', () => {
    const b = calcBalance(order, [repair])
    expect(isBalanced(order, b)).toBe(true)
    expect(b.inRepair).toBe(1)
    expect(canClose(order, b)).toBe(false)
  })

  it('QC lại phiếu sửa 1 pass → đóng được sau khi duyệt hao hụt', () => {
    const r = { ...repair, status: 'closed' as const, requc: { pass: 1, again: 0, hong: 0, by: 'u', at: now } }
    const b = calcBalance(order, [r])
    expect(isBalanced(order, b)).toBe(true)
    expect(canClose(order, b)).toBe(false)
    expect(canClose({ ...order, lossApproved: true }, b)).toBe(true)
  })

  it('QC nhập tổng ≠ số nhận → báo lỗi', () => {
    expect(validateQC(9, { pass: 8, sua: 0, vai: 0, hong: 0 })).toBe('Pass + fail phải bằng 9')
    expect(validateQC(9, { pass: 8, sua: 1, vai: 0, hong: 0 })).toBeNull()
  })
})

describe('mã phụ liệu tự sinh', () => {
  it('lấy số tiếp theo trong cùng loại', async () => {
    const { nextMaterialCode } = await import('./inventory')
    const ms = [{ ...mat(), code: 'VAI-01' }, { ...mat(), code: 'VAI-03' }, { ...mat(), code: 'NUT-01', category: 'nut' as const }]
    expect(nextMaterialCode('vai', ms)).toBe('VAI-04')
    expect(nextMaterialCode('vai', ms, 1)).toBe('VAI-05')
    expect(nextMaterialCode('chi', ms)).toBe('CHI-01')
  })
})

describe('dòng lỗi QC theo size', () => {
  it('bắt lỗi thiếu mô tả và size không có trong lệnh', async () => {
    const { validateDefectLines } = await import('./orders')
    expect(validateDefectLines([{ kind: 'sua', size: 'M', defect: 'Bỏ mũi', qty: 2 }], ['S', 'M'])).toBeNull()
    expect(validateDefectLines([{ kind: 'sua', size: 'M', defect: ' ', qty: 2 }])).toMatch(/mô tả/)
    expect(validateDefectLines([{ kind: 'vai', size: 'XL', defect: 'Lỗi sợi', qty: 1 }], ['S', 'M'])).toMatch(/không có trong lệnh/)
  })
})

describe('mức tồn phụ liệu', () => {
  it('0 là hết, trên 0 đến 10 là sắp hết, trên 10 là đủ', async () => {
    const { stockLevel } = await import('./inventory')
    expect(stockLevel({ ...mat(), stock: 0 })).toBe('out')
    expect(stockLevel({ ...mat(), stock: 10 })).toBe('low')
    expect(stockLevel({ ...mat(), stock: 10.5 })).toBe('ok')
  })
})

describe('thông báo hết / đủ hàng', () => {
  it('báo hết 1 lần khi xuống dưới, báo đủ khi nhập lên tới ngưỡng đủ', async () => {
    const { createMaterial, importMaterial, setThresholds } = await import('./actions')
    const { createBaseState } = await import('./state')
    const s = createBaseState()
    const c = { s, me: 'Phan Anh', meId: 'u1', now: new Date() }
    expect(createMaterial(c, { name: 'Vải lụa', unit: 'mét', category: 'vai', minStock: 50, okStock: 40 }).ok).toBe(false)
    expect(createMaterial(c, { name: 'Vải lụa', unit: 'mét', category: 'vai', minStock: 50, okStock: 200 }).ok).toBe(true)
    const m = s.materials[0]
    importMaterial(c, { materialId: m.id, qty: 30, price: 1000, supplier: '' })
    expect(s.notifications[0].text).toMatch(/báo hết/)
    importMaterial(c, { materialId: m.id, qty: 100, price: 1000, supplier: '' }) // 130: vẫn chưa đủ
    expect(s.notifications).toHaveLength(1)
    importMaterial(c, { materialId: m.id, qty: 100, price: 1000, supplier: '' }) // 230 ≥ 200
    expect(s.notifications[0].text).toMatch(/đã đủ hàng/)
    expect(setThresholds(c, m.id, { minStock: 300, okStock: 500 }).ok).toBe(true) // 230 < 300 → báo hết lại
    expect(s.notifications[0].text).toMatch(/báo hết/)
  })
})

describe('đồ khách gửi sửa', () => {
  it('nhận → gửi xưởng → xưởng trả → trả khách, đúng thứ tự', async () => {
    const A = await import('./actions')
    const { createBaseState } = await import('./state')
    const s = createBaseState()
    const c = { s, me: 'Team QC', meId: 'u3', now: new Date() }
    const due = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10)
    expect(A.createWorkshop(c, { name: 'Xưởng A', area: '', contactName: '', phone: '0903112456' }).ok).toBe(true)
    const r = A.createCustomerRepair(c, { customerName: 'Chị Mai', customerPhone: '0909123456', item: 'Đầm lụa', size: 'm', request: 'Lên lai 2cm', promisedDate: due })
    expect(r.ok && r.id).toBe('KS-001')
    expect(A.customerRepairDone(c, 'KS-001').ok).toBe(false) // chưa sửa thì chưa trả khách được
    expect(A.sendCustomerRepair(c, 'KS-001', s.workshops[0].id).ok).toBe(true)
    expect(A.customerRepairBack(c, 'KS-001').ok).toBe(true)
    expect(A.customerRepairDone(c, 'KS-001').ok).toBe(true)
    expect(s.customerRepairs[0].history).toHaveLength(4)
  })
})

describe('admin sửa / hủy lệnh', () => {
  it('sửa số lượng trước khi cắt thì xuất thêm / hoàn phụ liệu; hủy thì hoàn kho, lệnh không thao tác được nữa', async () => {
    const A = await import('./actions')
    const { createBaseState } = await import('./state')
    const s = createBaseState()
    const c = { s, me: 'Phan Anh', meId: 'u1', now: new Date() }
    const due = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10)
    A.createWorkshop(c, { name: 'Xưởng A', area: '', contactName: '', phone: '0903112456' })
    A.createMaterial(c, { name: 'Vải', unit: 'mét', category: 'vai', minStock: 1, okStock: 2 })
    const m = s.materials[0]
    A.importMaterial(c, { materialId: m.id, qty: 100, price: 1000, supplier: '' })
    A.createProduct(c, { sku: 'SP1', name: 'Áo', laborCost: 0, bom: [{ material: m.id, qtyPerUnit: 2 }] })
    const r = A.createOrder(c, { productId: s.products[0].id, workshopId: s.workshops[0].id, sizes: [{ size: 'M', qty: 10 }], dueDate: due })
    const id = r.ok ? r.id! : ''
    expect(m.stock).toBe(80)
    expect(A.editOrder(c, id, { sizes: [{ size: 'M', qty: 15 }] }).ok).toBe(true)
    expect(m.stock).toBe(70)
    expect(A.editOrder(c, id, { sizes: [{ size: 'M', qty: 5 }] }).ok).toBe(true)
    expect(m.stock).toBe(90)
    expect(A.cancelOrder(c, id, { reason: '', returnMaterials: true, removeFinished: false }).ok).toBe(false)
    expect(A.cancelOrder(c, id, { reason: 'Nhập nhầm', returnMaterials: true, removeFinished: false }).ok).toBe(true)
    expect(m.stock).toBe(100) // hoàn đủ phần còn lại
    expect(m.avgPrice).toBe(1000) // hoàn kho không đổi giá BQ
    expect(A.confirmCut(c, id).ok).toBe(false)
    expect(A.editOrder(c, id, { dueDate: due }).ok).toBe(false)
  })
})

describe('nhắc việc', () => {
  it('QC được nhắc hàng chờ QC; không có việc thì không gửi', async () => {
    const A = await import('./actions')
    const { createBaseState } = await import('./state')
    const s = createBaseState()
    const c = { s, me: 'Phan Anh', meId: 'u1', now: new Date() }
    expect(A.sendReminders(c).ok).toBe(false)
    const due = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10)
    A.createWorkshop(c, { name: 'Xưởng A', area: '', contactName: '', phone: '0903112456' })
    A.createMaterial(c, { name: 'Vải', unit: 'mét', category: 'vai', minStock: 1, okStock: 2 })
    A.importMaterial(c, { materialId: s.materials[0].id, qty: 100, price: 1000, supplier: '' })
    A.createProduct(c, { sku: 'SP1', name: 'Áo', laborCost: 0, bom: [{ material: s.materials[0].id, qtyPerUnit: 1 }] })
    const id = (A.createOrder(c, { productId: s.products[0].id, workshopId: s.workshops[0].id, sizes: [{ size: 'M', qty: 5 }], dueDate: due }) as { id: string }).id
    A.confirmCut(c, id)
    A.receive(c, id, { sizes: [{ size: 'M', qty: 5 }] })
    expect(A.sendReminders(c).ok).toBe(true)
    expect(s.notifications.find(n => n.roles.includes('qc') && /Việc QC/.test(n.text))?.text).toMatch(/chờ QC/)
  })
})

describe('nhập Sapo', () => {
  it('tạo mẫu mới, nhập lại thì cập nhật theo SKU; chưa có định mức thì không tạo lệnh', async () => {
    const A = await import('./actions')
    const { createBaseState } = await import('./state')
    const s = createBaseState()
    const c = { s, me: 'Phan Anh', meId: 'u1', now: new Date() }
    const item = { name: 'Chelsea Skirts', category: 'CHÂN VÁY', tags: ['Nhận sửa - không nhận custom'], variants: [
      { size: 'S', color: 'Beige', sku: 'PVN5778', price: 720000 }, { size: 'M', color: 'Beige', sku: 'PVN5779' }, { size: 'S', color: 'Black', sku: 'PVN5790' }] }
    expect(A.importSapo(c, [item]).ok).toBe(true)
    expect(s.products).toHaveLength(1)
    expect(A.importSapo(c, [{ ...item, name: 'Chelsea Skirts 2026' }]).ok).toBe(true)
    expect(s.products).toHaveLength(1) // khớp SKU → cập nhật, không tạo trùng
    expect(s.products[0].name).toBe('Chelsea Skirts 2026')
    expect(A.findBySku(s, 'pvn5790')?.variant.color).toBe('Black')
    A.createWorkshop(c, { name: 'Xưởng A', area: '', contactName: '', phone: '0903112456' })
    const due = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10)
    const r = A.createOrder(c, { productId: s.products[0].id, workshopId: s.workshops[0].id, sizes: [{ size: 'S', qty: 1 }], dueDate: due })
    expect(r.ok ? '' : r.error).toMatch(/chọn màu/) // nhiều màu phải chọn màu
    const r2 = A.createOrder(c, { productId: s.products[0].id, workshopId: s.workshops[0].id, sizes: [{ size: 'S', qty: 1 }], dueDate: due, color: 'Beige' })
    expect(r2.ok ? '' : r2.error).toMatch(/định mức/)
  })
})

describe('ảnh lỗi QC', () => {
  it('chỉ nhận link Cloudinary', async () => {
    const { PHOTO_RE } = await import('./actions')
    expect(PHOTO_RE.test('https://res.cloudinary.com/ue0mnb27/image/upload/v1759000000/walenty/qc/abc123.jpg')).toBe(true)
    expect(PHOTO_RE.test('https://evil.example.com/x.jpg')).toBe(false)
    expect(PHOTO_RE.test('javascript:alert(1)')).toBe(false)
    expect(PHOTO_RE.test('https://res.cloudinary.com/x/image/upload/a.jpg"><script>')).toBe(false)
  })
})

describe('tính giá theo file TÍNH GIÁ SP', () => {
  it('công may + vải chính + lót + phụ liệu = đúng ô Giá cost trong Excel', async () => {
    const { costBreakdown, formulaPrice, costRatio } = await import('./inventory')
    const p = {
      id: 'p', sku: 'M-1', name: '2 khuy blazer Cotton', laborCost: 0, bom: [], status: 'active' as const,
      costing: { '': { labor: 260000, fabric: { qty: 1.5, price: 53000 }, lining: { qty: 1.5, price: 26500 }, acc: { tag: 3500, buttons: 6250 }, ratio: 0.32, listPrice: 1350000 } },
    }
    const b = costBreakdown(p, [])
    expect(b.total).toBe(389000)
    expect(b.fabricFrom).toBe('file')
    expect(Math.round(formulaPrice(b.total, 0.32))).toBe(1312875) // ô "Giá bán công thức"
    expect(costRatio(b.total, 1350000)).toBeCloseTo(0.3112, 4) // ô "Cost thực tế"
  })
  it('có định mức theo màu thì vải tính theo kho, cúc trong định mức không cộng lại', async () => {
    const { costBreakdown } = await import('./inventory')
    const mats = [
      { id: 'v', code: 'VC-1', category: 'vai', name: 'vải', unit: 'mét', stock: 10, avgPrice: 50000, totalImportQty: 0, totalImportCost: 0, minStock: 0, status: 'active' },
      { id: 'c', code: 'CUC-1', category: 'nut', name: 'cúc', unit: 'cái', stock: 10, avgPrice: 3000, totalImportQty: 0, totalImportCost: 0, minStock: 0, status: 'active' },
    ] as Material[]
    const p = {
      id: 'p', sku: 'M-1', name: 'x', laborCost: 0, bom: [], status: 'active' as const,
      variants: [{ size: 'S', color: 'Đen', sku: 'A1' }, { size: 'S', color: 'Trắng', sku: 'A2' }],
      bomByColor: { 'Đen': [{ material: 'v', qtyPerUnit: 1.5 }, { material: 'c', qtyPerUnit: 2 }] },
      costing: { '': { labor: 260000, acc: { tag: 3500, buttons: 6250 } } },
    }
    const den = costBreakdown(p, mats, 'Đen')
    expect(den.fabricFrom).toBe('bom')
    expect(den.total).toBe(75000 + 6000 + 260000 + 3500) // cúc lấy theo kho, bỏ 6250 của file
    expect(costBreakdown(p, mats, 'Trắng').fabricFrom).toBe('file')
  })
})

describe('đồng bộ file NVL', () => {
  it('tồn đầu + nhập − xuất theo ngày, tồn âm đưa về 0, chạy lại bị chặn', async () => {
    const { importNvl } = await import('./actions')
    const { createBaseState } = await import('./state')
    const s = createBaseState()
    const c = { s, me: 'test', now: new Date('2026-10-05T12:00:00Z'), notes: [] } as never
    const r = importNvl(c, {
      openingDate: '2025-09-30',
      materials: [
        { code: 'VC-0001', name: 'Cotton đen', unit: 'mét', category: 'vai', price: 53000, opening: 10 },
        { code: 'VC-0002', name: 'Cotton trắng', unit: 'mét', category: 'vai', price: 53000, opening: 0 },
      ],
      moves: [
        { code: 'VC-0001', type: 'in', qty: 5, date: '2025-10-02' },
        { code: 'VC-0001', type: 'out', qty: 3, date: '2025-10-03' },
        { code: 'VC-0002', type: 'out', qty: 2, date: '2025-10-03' },
      ],
      boms: [],
    })
    expect(r.ok).toBe(true)
    const m1 = s.materials.find(m => m.code === 'VC-0001')!, m2 = s.materials.find(m => m.code === 'VC-0002')!
    expect(m1.stock).toBe(12)
    expect(m1.avgPrice).toBe(53000)
    expect(m2.stock).toBe(0)
    expect(s.materialTxns.filter(t => t.material === m1.id && t.type === 'in').reduce((t, x) => t + x.qty * (x.price ?? 0), 0)).toBe(5 * 53000)
    expect(importNvl(c, { openingDate: '2025-09-30', materials: [{ code: 'VC-0001', name: 'x', unit: 'mét', category: 'vai', price: 1, opening: 0 }], moves: [], boms: [] }).ok).toBe(false)
  })
})
