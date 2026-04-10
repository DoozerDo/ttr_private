const path = require("path");
const fs = require("fs");

function resolveSharedWorkspaceDir() {
  const candidates = [
    path.resolve(__dirname, "packages/shared"),
    path.resolve(__dirname, "../packages/shared"),
    path.resolve(__dirname, "../../packages/shared"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[candidates.length - 1];
}

module.exports = {
  experimental: {
    externalDir: true,
  },
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
  webpack: (config) => {
    config.resolve.alias["@shared"] = resolveSharedWorkspaceDir();
    config.resolve.modules = [path.resolve(__dirname, "../../"), "node_modules"];
    return config;
  },
};
