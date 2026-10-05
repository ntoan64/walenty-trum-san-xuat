import type { EventType, ProdEvent } from './types'
import { sum } from './util'

export interface Agg {
  issue: number
  receive: number
  pass: number
  fail: number
  sua: number
  back: number
  loss: number
  fpy: number | null
}

// Báo cáo tính từ events, không tính lại từ trạng thái hiện tại
export function aggregate(evs: ProdEvent[]): Agg {
  const g = (t: EventType, round?: number) =>
    sum(evs.filter(e => e.type === t && (round === undefined || e.round === round)), e => e.qty)
  const p1 = g('pass', 1)
  const f1 = g('sua', 1) + g('hong', 1)
  return {
    issue: g('issue'),
    receive: g('receive'),
    pass: g('pass'),
    fail: g('sua') + g('vai') + g('hong'),
    sua: g('sua'),
    back: g('back'),
    loss: g('loss'),
    // Pass lần đầu = pass vòng 1 ÷ (pass vòng 1 + lỗi may + hỏng vòng 1), không tính lỗi vải
    fpy: p1 + f1 ? p1 / (p1 + f1) : null,
  }
}

export const inRange = (evs: ProdEvent[], from: Date, to?: Date) =>
  evs.filter(e => e.at >= from && (!to || e.at <= to))
