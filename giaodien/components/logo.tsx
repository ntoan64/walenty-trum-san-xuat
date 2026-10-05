import { cn } from "@/lib/utils";

// Ô logo nền trắng để logo burgundy luôn rõ ở cả chế độ sáng và tối
export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn("grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-white shadow-[0_1px_6px_rgba(0,0,0,0.08)]", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-mark.png" alt="Walenty" className="size-[86%] object-contain" />
    </span>
  );
}

export function Logo({ sub = "Trùm Sản Xuất" }: { sub?: string }) {
  return (
    <div className="flex items-center gap-3">
      <LogoMark />
      <div className="flex flex-col leading-tight">
        <span className="font-serif text-lg font-semibold tracking-[0.12em] text-brand">WALENTY</span>
        <span className="eyebrow !text-brown">{sub}</span>
      </div>
    </div>
  );
}

// Logo đầy đủ (vương miện + chữ WALENTY) cho trang đăng nhập
export function LogoFull({ className }: { className?: string }) {
  return (
    <span className={cn("inline-block overflow-hidden rounded-lg bg-white", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="Walenty" className="size-full object-contain" />
    </span>
  );
}
