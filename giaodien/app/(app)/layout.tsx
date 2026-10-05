import { redirect } from "next/navigation";
import { AppShell } from "@/components/xf/app-shell";
import { currentUser } from "@/lib/session";

// Chưa đăng nhập (hoặc tài khoản bị khóa) thì về trang đăng nhập
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const me = await currentUser();
  if (!me) redirect("/login");
  return <AppShell>{children}</AppShell>;
}
