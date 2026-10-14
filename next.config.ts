import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "pg-boss"],
  devIndicators: false,
  // 重启 dev 时复用旧的编译缓存会让已打开的页面陷入热更新整页重载循环，缓存还会在 .next/dev 里越积越大
  experimental: { turbopackFileSystemCacheForDev: false },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
