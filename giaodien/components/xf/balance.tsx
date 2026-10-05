import type { Balance } from "@core";
import { cn } from "@/lib/utils";

const SEGS = [
  { key: "pass", label: "QC pass (đã nhập kho)", cls: "bg-ok" },
  { key: "pendingQC", label: "Chờ QC", cls: "bg-qcbar" },
  { key: "inRepair", label: "Đang sửa ở xưởng", cls: "bg-warn" },
  { key: "scrap", label: "Loại / hàng B", cls: "bg-scrap" },
  { key: "loss", label: "Hao hụt", cls: "bg-bad" },
  { key: "notReturned", label: "Xưởng chưa trả", cls: "bg-wait" },
] as const;

export function BalanceBar({ qty, b, big }: { qty: number; b: Balance; big?: boolean }) {
  return (
    <div
      role="img"
      aria-label={`Cân đối: ${SEGS.map(s => `${s.label} ${b[s.key]}`).join(", ")}`}
      className={cn("flex w-full overflow-hidden rounded-full bg-surface-3", big ? "h-3.5" : "h-2")}
    >
      {SEGS.filter(s => b[s.key] > 0).map(s => (
        <i key={s.key} className={cn("block h-full transition-[width] duration-500 ease-out", s.cls)} style={{ width: `${(b[s.key] / qty) * 100}%` }} />
      ))}
    </div>
  );
}

export function BalanceLegend({ b }: { b: Balance }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2">
      {SEGS.map(s => (
        <div key={s.key} className="flex items-center gap-2 text-[13px]">
          <span className={cn("size-2.5 shrink-0 rounded-[3px]", s.cls)} />
          <span className="min-w-0">{s.label}</span>
          <b className="num ml-auto">{b[s.key]}</b>
        </div>
      ))}
    </div>
  );
}

export function BalanceEquation({ qty, b, settled }: { qty: number; b: Balance; settled: boolean }) {
  const parts: [number, string][] = [
    [b.pass, "pass"], [b.pendingQC, "chờ QC"], [b.inRepair, "đang sửa"],
    [b.scrap, "loại"], [b.loss, "hao hụt"], [b.notReturned, "chưa trả"],
  ];
  return (
    <div className={cn("mt-3 rounded-lg px-3 py-2.5 text-[13px] leading-relaxed", settled ? "bg-ok-soft" : "bg-surface-2")}>
      <b className="num">{qty}</b> giao ={" "}
      {parts.map(([v, t], i) => (
        <span key={t}>
          {i > 0 && " + "}
          <span className="num">{v}</span> {t}
        </span>
      ))}
    </div>
  );
}

export function StepProgress({ step }: { step: "cut" | "sew" | "qc" | "done" }) {
  const steps = [
    ["Chờ cắt", "Xưởng nhận vải, chờ cắt"],
    ["Nhận may", "Xưởng đang may"],
    ["QC", "Kiểm từng đợt trả về"],
    ["Hoàn thành", "Đã cân đủ số lượng"],
  ];
  const idx = ["cut", "sew", "qc", "done"].indexOf(step);
  return (
    <ol className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
      {steps.map(([t, s], i) => {
        const done = i < idx || step === "done";
        const now = i === idx && step !== "done";
        return (
          <li
            key={t}
            aria-current={now ? "step" : undefined}
            className={cn(
              "rounded-lg px-3 py-2 text-[12.5px]",
              done && "bg-ok-soft text-muted-foreground",
              now && "bg-brand text-brand-fg shadow-[0_1px_4px_rgba(94,17,23,0.2)]",
              !done && !now && "bg-surface-2 text-muted-foreground",
            )}
          >
            <b className={cn("block text-[13px]", now ? "text-brand-fg" : "text-fg")}>{i + 1}. {t}</b>
            {s}
          </li>
        );
      })}
    </ol>
  );
}
