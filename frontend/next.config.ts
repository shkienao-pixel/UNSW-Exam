import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.exammaster.tech" }],
        destination: "https://exammaster.tech/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
