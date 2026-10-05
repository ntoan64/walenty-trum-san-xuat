import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cho phép import lõi nghiệp vụ (../chucnang/core) và server (../chucnang/server)
  turbopack: {
    root: path.join(__dirname, ".."),
  },
  serverExternalPackages: ["mongodb"],
  // Mở bằng điện thoại cùng mạng WiFi (http://<IP máy tính>:3000) khi chạy dev
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
};

export default nextConfig;
