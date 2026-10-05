import type { User } from "@core";
import { cn } from "@/lib/utils";

// Ảnh đại diện; chưa có ảnh thì hiện chữ cái đầu trên nền burgundy
export function Avatar({ user, name, size = 32, className }: { user?: Pick<User, "name" | "avatar">; name?: string; size?: number; className?: string }) {
  const n = user?.name ?? name ?? "?";
  const initials = n.split(/\s+/).filter(Boolean).slice(-2).map(w => w[0]).join("").toUpperCase();
  return (
    <span
      className={cn("inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-brand font-semibold text-brand-fg", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden
    >
      {user?.avatar
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={user.avatar} alt="" className="size-full object-cover" />
        : initials}
    </span>
  );
}

// Thu nhỏ ảnh về hình vuông 160px (cắt giữa) để lưu nhẹ
export function resizeImage(file: File, px = 160): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Chọn file ảnh (JPG, PNG…)"));
    if (file.size > 8 * 1024 * 1024) return reject(new Error("Ảnh tối đa 8MB"));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = px;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, px, px);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Không đọc được ảnh")); };
    img.src = url;
  });
}
