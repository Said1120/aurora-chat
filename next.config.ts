import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/aurora-chat",
  assetPrefix: "/aurora-chat",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
