"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  ChartColumn, ClipboardList, History, Factory, Layers, LayoutDashboard, LogOut, PackageCheck, Scissors, Send, ShieldCheck, Shirt, Users,
  type LucideIcon,
} from "lucide-react";
import { canView, ROLE_LABEL, type Screen } from "@core";
import { cn } from "@/lib/utils";
import { StoreProvider, useStore } from "@/lib/store";
import { navBadges } from "@/lib/selectors";
import { Logo } from "@/components/logo";
import { NotificationFeed } from "./notification-feed";
import { usePref } from "@/lib/use-pref";
import { Avatar } from "./avatar";
import { EmptyState, Panel } from "./basics";
import { ConfirmProvider } from "./confirm-provider";

// team: nhóm phân hệ trên menu (Team Sản xuất / Team MKT / Team Sale cửa hàng)
export type Team = "sx" | "mkt" | "sale";
export const TEAMS: { id: Team; label: string; soon?: string }[] = [
  { id: "sx", label: "Team Sản xuất" },
  { id: "mkt", label: "Team MKT", soon: "Đang phát triển" },
  { id: "sale", label: "Team Sale cửa hàng", soon: "Các mục khác đang phát triển" },
];
export const NAV: { href: string; screen: Screen; label: string; icon: LucideIcon; team: Team }[] = [
  { href: "/", screen: "overview", label: "Tổng quan", icon: LayoutDashboard, team: "sx" },
  { href: "/lenh-san-xuat", screen: "orders", label: "Lệnh sản xuất", icon: ClipboardList, team: "sx" },
  { href: "/qc", screen: "qc", label: "QC & trả sửa", icon: ShieldCheck, team: "sx" },
  { href: "/kho-phu-lieu", screen: "materials", label: "Kho nguyên phụ liệu", icon: Layers, team: "sx" },
  { href: "/san-pham", screen: "products", label: "Sản phẩm & định mức", icon: Shirt, team: "sx" },
  { href: "/kho-thanh-pham", screen: "finished", label: "Kho thành phẩm", icon: PackageCheck, team: "sx" },
  { href: "/sua-cho-khach", screen: "customer", label: "Đồ khách gửi sửa", icon: Scissors, team: "sale" },
  { href: "/xuong", screen: "workshops", label: "Xưởng may & NCC", icon: Factory, team: "sx" },
  { href: "/bao-cao", screen: "reports", label: "Báo cáo", icon: ChartColumn, team: "sx" },
  { href: "/lich-su", screen: "history", label: "Lịch sử thao tác", icon: History, team: "sx" },
  { href: "/nhan-vien", screen: "users", label: "Nhân viên", icon: Users, team: "sx" },
];

export function screenOf(path: string): Screen {
  const hit = NAV.filter(n => n.href !== "/").find(n => path === n.href || path.startsWith(n.href + "/"));
  return hit?.screen ?? "overview";
}

function Sidebar() {
  const { data, role, meUser, logout } = useStore();
  const path = usePathname();
  const cur = screenOf(path);
  const badges = navBadges(data, new Date());
  const items = NAV.filter(n => canView(role, n.screen));
  // mỗi team bấm để mở / thu gọn; team chứa trang đang xem luôn mở
  const [openTeams, setOpenTeams] = usePref<Record<string, boolean>>("nav:teams", { sx: true });
  const curTeam = NAV.find(n => n.screen === cur)?.team;

  return (
    <aside className="flex min-w-0 flex-col gap-4 min-[820px]:sticky min-[820px]:top-4 min-[820px]:max-h-[calc(100dvh-2rem)] min-[820px]:self-start">
      <div className="rounded-xl card p-3">
        <Logo />
      </div>

      {(
        <Link href="/tai-khoan" className="flex items-center gap-2.5 rounded-xl bg-surface-low px-3 py-2 hover:bg-surface-2" aria-current={path === "/tai-khoan" ? "page" : undefined}>
          <Avatar user={meUser} size={36} />
          <span className="min-w-0 leading-tight">
            <b className="block truncate text-[13.5px]">{meUser.name}</b>
            <span className="text-xs text-brown">{meUser.title ?? ROLE_LABEL[meUser.role]} · Thông tin</span>
          </span>
        </Link>
      )}

      <nav aria-label="Phân hệ" className="flex gap-1 overflow-x-auto pb-1 min-[820px]:flex-col min-[820px]:overflow-visible min-[820px]:pb-0">
        {TEAMS.map(t => {
          const list = items.filter(n => n.team === t.id);
          if (!list.length && !t.soon) return null;
          return (
          <div key={t.id} className="contents min-[820px]:flex min-[820px]:flex-col min-[820px]:gap-1 min-[820px]:[&:not(:first-child)]:mt-3">
            <button type="button" aria-expanded={openTeams[t.id] || curTeam === t.id}
              onClick={() => setOpenTeams({ ...openTeams, [t.id]: !(openTeams[t.id] || curTeam === t.id) })}
              className="eyebrow hidden items-center justify-between rounded-md px-2 py-1 text-left hover:bg-surface-3 min-[820px]:flex">
              {t.label}
              <ChevronDown className={cn("size-3.5 transition-transform duration-200", (openTeams[t.id] || curTeam === t.id) && "rotate-180")} />
            </button>
            {(openTeams[t.id] || curTeam === t.id) && <div className="reveal contents min-[820px]:flex min-[820px]:flex-col min-[820px]:gap-1">
            {list.map(n => {
          const active = n.screen === cur;
          const Icon = n.icon;
          const badge = badges[n.screen];
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex min-h-10 shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] font-semibold whitespace-nowrap transition-all duration-200",
                active ? "bg-brand text-brand-fg shadow-[0_1px_4px_rgba(94,17,23,0.18)]" : "text-muted-foreground hover:bg-surface-3 hover:text-fg",
              )}
            >
              <Icon className={cn("size-[18px] shrink-0 transition-transform duration-200", !active && "group-hover:scale-110")} />
              <span>{n.label}</span>
              {!!badge && (
                <span key={badge} className={cn("num ml-auto min-w-5 rounded-full px-1.5 text-center text-[11px] animate-in zoom-in-50 duration-300", active ? "bg-brand-fg text-brand" : "bg-bad text-white")}>
                  {badge}
                </span>
              )}
            </Link>
          );
            })}
            {t.soon && <div className="hidden px-3 py-1 text-[12px] text-subtle italic min-[820px]:block">{t.soon}</div>}
            </div>}
          </div>
          );
        })}
      </nav>

      <div className="mt-auto hidden flex-col gap-2 rounded-xl bg-surface-2 p-3 min-[820px]:flex">
        <button type="button" onClick={logout} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-surface-3 hover:text-fg">
          <LogOut className="size-4" /> Đăng xuất
        </button>
        <div className="flex items-center justify-between px-2 text-[11px] text-subtle">
          <span className="font-serif italic">Walenty Trùm Sản Xuất</span>
          <span className="num">v0.1</span>
        </div>
      </div>
    </aside>
  );
}

function Guarded({ children }: { children: React.ReactNode }) {
  const { role } = useStore();
  const path = usePathname();
  if (!canView(role, screenOf(path))) {
    return (
      <Panel title="Không có quyền xem">
        <EmptyState>
          Vai trò {ROLE_LABEL[role]} không xem được trang này.{" "}
          <Link href="/" className="font-semibold text-brand hover:underline">Về Tổng quan</Link>
        </EmptyState>
      </Panel>
    );
  }
  return <>{children}</>;
}

function ShellSkeleton() {
  return (
    <div className="mx-auto grid max-w-[1560px] grid-cols-[minmax(0,1fr)] gap-5 p-4 min-[820px]:grid-cols-[230px_minmax(0,1fr)]">
      <div className="h-[60vh] animate-pulse rounded-xl bg-surface-2" />
      <div className="flex flex-col gap-4">
        <div className="h-28 animate-pulse rounded-xl bg-surface-2" />
        <div className="h-64 animate-pulse rounded-xl bg-surface-2" />
      </div>
    </div>
  );
}

// Khung chính; cột Xưởng Bot chỉ hiện với người có quyền xem thông báo (QC không có)
// Nút tròn mở lại Xưởng Bot khi đã đóng; số đỏ = tin mới từ lần xem trước
function FeedLauncher({ onOpen, seenAt }: { onOpen: () => void; seenAt: number }) {
  const { data } = useStore();
  const unread = data.notifications.filter(n => n.from && n.sentAt.getTime() > seenAt).length;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={unread ? `Mở Xưởng Bot, ${unread} tin mới` : "Mở Xưởng Bot"}
      className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom,0px)+16px)] z-40 grid size-13 place-items-center rounded-full bg-brand text-brand-fg shadow-[0_6px_20px_rgba(94,17,23,0.35)] animate-in zoom-in-75 fade-in duration-300 hover:scale-105"
    >
      <Send className="size-5" />
      {unread > 0 && (
        <span className="num absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-bad px-1 text-[11px] text-white ring-2 ring-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const { can } = useStore();
  const path = usePathname();
  const feed = can("notify.view");
  const [feedOpen, setFeedOpen] = usePref("feed:open", true);
  const [seenAt, setSeenAt] = usePref("feed:seenAt", 0);
  const showFeed = feed && feedOpen;
  const close = () => { setFeedOpen(false); setSeenAt(Date.now()); };
  const open = () => { setFeedOpen(true); setSeenAt(Date.now()); };
  return (
    <div className={cn(
      "mx-auto grid max-w-[1560px] grid-cols-[minmax(0,1fr)] gap-5 px-4 py-4 min-[820px]:grid-cols-[230px_minmax(0,1fr)]",
      showFeed && "min-[1200px]:grid-cols-[240px_minmax(0,1fr)_320px]",
    )}>
      <Sidebar />
      <main className="flex min-w-0 flex-col gap-5">
        {/* key theo đường dẫn: mỗi lần chuyển trang chạy lại hiệu ứng vào trang */}
        <div key={path} className="page-enter flex min-w-0 flex-col gap-5">
          <Guarded>{children}</Guarded>
        </div>
      </main>
      {showFeed && (
        <div className="min-w-0 animate-in fade-in slide-in-from-right-4 duration-300 min-[820px]:col-start-2 min-[1200px]:col-start-3 min-[1200px]:row-start-1 min-[1200px]:sticky min-[1200px]:top-4 min-[1200px]:h-[calc(100dvh-2rem)] min-[1200px]:self-start">
          <div className="flex h-[420px] min-[1200px]:h-full">
            <NotificationFeed onClose={close} />
          </div>
        </div>
      )}
      {feed && !feedOpen && <FeedLauncher onOpen={open} seenAt={seenAt} />}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider fallback={<ShellSkeleton />}>
      <ConfirmProvider>
        <Layout>{children}</Layout>
      </ConfirmProvider>
    </StoreProvider>
  );
}
