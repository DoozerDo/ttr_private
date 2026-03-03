import path from "path";
import type { NextConfig } from "next";

type DebugNextConfig = NextConfig & {
  swcMinify?: boolean;
};

const nextConfig: DebugNextConfig = {
  // TEMP DEBUGGING: revert after hydration mismatch root cause is fixed.
  productionBrowserSourceMaps: true,
  swcMinify: false,
  experimental: {
    externalDir: true,
  },
  // Point Turbopack at the monorepo root so workspace resolution is deterministic.
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
  webpack(config, { dev, isServer }) {
    if (!dev && !isServer) {
      config.devtool = "source-map";
      config.optimization = {
        ...config.optimization,
        minimize: false,
      };
    }
    return config;
  },
};

export default nextConfig;
