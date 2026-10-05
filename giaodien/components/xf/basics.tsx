import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------- Đầu trang: nhãn nhỏ + tiêu đề serif + mô tả, bên phải là số liệu nhanh ---------- */
export function PageHeader({
  eyebrow, title, desc, back, aside, children,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  desc?: React.ReactNode;
  back?: { href: string; label: string };
  aside?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="relative overflow-hidden rounded-xl card p-5 md:p-6">
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-brand/5 blur-3xl" />
      <div className="relative flex flex-col gap-4 min-[1500px]:flex-row min-[1500px]:items-center min-[1500px]:justify-between">
        <div className="min-w-0 max-w-2xl">
          {back && (
            <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline">
              <ArrowLeft className="size-4" /> {back.label}
            </Link>
          )}
          {eyebrow && (
            <div className="eyebrow mb-1 flex flex-wrap items-center gap-1.5 !text-brown">
              <span className="size-1.5 rounded-full bg-brand" />
              {eyebrow}
            </div>
          )}
          <h1 className="font-serif text-[22px] leading-tight font-semibold text-brand md:text-[26px]">{title}</h1>
          {desc && <div className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{desc}</div>}
          {children}
        </div>
        {aside}
      </div>
    </header>
  );
}

/* ---------- Panel: dải tiêu đề có icon, nền trắng, bóng nhẹ ---------- */
export function Panel({
  title, icon: Icon, tag, actions, hint, children, className, bodyClassName, flush,
}: {
  title?: React.ReactNode;
  icon?: LucideIcon;
  tag?: React.ReactNode;
  actions?: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  flush?: boolean; // bảng sát mép
}) {
  return (
    <section className={cn("min-w-0 overflow-hidden rounded-xl card", className)}>
      {title && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-surface-low px-4 py-3 md:px-5">
          <div className="flex min-w-0 items-center gap-2">
            {Icon && <Icon className="size-5 shrink-0 text-brand" />}
            <h2 className="font-serif text-[16px] font-semibold text-brand">{title}</h2>
            {tag}
          </div>
          {actions}
        </div>
      )}
      <div className={cn(flush ? "" : "p-4 md:p-5", bodyClassName)}>
        {hint && <p className={cn("mb-3 text-[13px] text-muted-foreground", flush && "px-4 pt-3 md:px-5")}>{hint}</p>}
        {children}
      </div>
    </section>
  );
}

export function Tag({ children }: { children: React.ReactNode }) {
  return <span className="num rounded bg-surface-2 px-2 py-0.5 text-[11px] text-brown">{children}</span>;
}

/* ---------- Thẻ số liệu ---------- */
type Tone = "default" | "alert" | "brand" | "brown" | "ok";
const toneText: Record<Tone, string> = {
  default: "text-fg", alert: "text-bad", brand: "text-brand", brown: "text-brown", ok: "text-ok",
};
export function StatCard({
  label, value, unit, sub, tone = "default", icon: Icon, className,
}: {
  label: React.ReactNode; value: React.ReactNode; unit?: string; sub?: React.ReactNode;
  tone?: Tone; icon?: LucideIcon; className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col justify-between rounded-lg card p-4 hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(31,27,26,0.06)]", className)}>
      <span className="eyebrow">{label}</span>
      <div className="my-1 flex items-baseline gap-1">
        <span className={cn("font-serif text-[26px] leading-tight font-bold tabular-nums", toneText[tone])}>{value}</span>
        {unit && <span className="text-[11px] font-semibold text-muted-foreground">{unit}</span>}
      </div>
      {sub && (
        <span className={cn("flex items-center gap-1 text-xs", tone === "alert" ? "text-bad" : "text-muted-foreground")}>
          {Icon && <Icon className="size-3.5" />}
          {sub}
        </span>
      )}
    </div>
  );
}

/* ---------- Nhãn trạng thái ---------- */
export type PillTone = "ok" | "warn" | "bad" | "info" | "muted" | "brand";
const pillCls: Record<PillTone, string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
  muted: "bg-surface-2 text-muted-foreground",
  brand: "bg-brand-soft text-brand",
};
const dotCls: Record<PillTone, string> = {
  ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", info: "bg-info", muted: "bg-subtle", brand: "bg-brand",
};
export function StatusPill({ tone = "muted", dot, children, className }: { tone?: PillTone; dot?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold whitespace-nowrap", pillCls[tone], className)}>
      {dot && <span className={cn("size-1.5 rounded-full", dotCls[tone])} />}
      {children}
    </span>
  );
}

/* ---------- Dòng cần xử lý ---------- */
const alertCls = {
  bad: "border-bad bg-bad-soft",
  warn: "border-warn bg-warn-soft",
  info: "border-info bg-info-soft",
};
export function AlertRow({
  tone, title, sub, href, cta = "Xem",
}: { tone: keyof typeof alertCls; title: React.ReactNode; sub?: React.ReactNode; href?: string; cta?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 rounded-lg border-l-[3px] px-3 py-2.5 transition-transform duration-200 hover:translate-x-1", alertCls[tone])}>
      <div className="min-w-0">
        <div className="font-semibold">{title}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
      {href && (
        <Link href={href} className="shrink-0 rounded-md bg-surface px-3 py-1.5 text-xs font-semibold text-brand shadow-sm hover:bg-surface-2">
          {cta}
        </Link>
      )}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="px-2 py-6 text-center text-[13px] text-muted-foreground">{children}</div>;
}

/* ---------- Ô nhập liệu ---------- */
export function Field({ label, htmlFor, error, children, className }: {
  label: string; htmlFor: string; error?: string | null; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-bad">{error}</p>}
    </div>
  );
}

export function NumberField({ id, label, value, onChange, min = 0, max, step, error, className }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  min?: number; max?: number; step?: number | "any"; error?: string | null; className?: string;
}) {
  return (
    <Field label={label} htmlFor={id} error={error} className={className}>
      <input
        id={id} type="number" inputMode="decimal" className="field-input num" value={value}
        min={min} max={max} step={step} aria-invalid={!!error || undefined}
        onChange={e => onChange(e.target.value)}
      />
    </Field>
  );
}

/* ---------- Hộp tính trước khi bấm ---------- */
export function CalcHint({ bad, children }: { bad?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("col-span-full rounded-lg px-3 py-2.5 text-[13px] [&_b]:font-semibold", bad ? "bg-bad-soft [&_b]:text-bad" : "bg-brand-soft/60 [&_b]:text-brand")}>
      {children}
    </div>
  );
}

/* ---------- Bảng cuộn ngang trong khung riêng ---------- */
export function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="w-full overflow-x-auto">{children}</div>;
}
