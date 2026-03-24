import path from "path";
import type { NextConfig } from "next";

process.env.BROWSERSLIST_IGNORE_OLD_DATA ??= "1";
process.env.BASELINE_BROWSER_MAPPING_IGNORE_OLD_DATA ??= "1";
process.env.TTR_SILENCE_BASELINE_BROWSER_MAPPING_WARNING ??= "1";

const nextConfig: NextConfig = {
  // TEMP DEBUGGING: revert after hydration mismatch root cause is fixed.
  productionBrowserSourceMaps: true,
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
