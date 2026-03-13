import type { NextConfig } from "next";

const securityHeaders = [
  // 防止点击劫持
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // 防止 MIME 嗅探
  { key: "X-Content-Type-Options", value: "nosniff" },
  // 限制 Referer 信息泄露
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 防止跨域信息泄露（仅同源读取 opener）
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
