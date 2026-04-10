const path = require("path");

module.exports = {
  experimental: {
    externalDir: true,
  },
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
  webpack: (config) => {
    config.resolve.alias["@shared"] = path.resolve(__dirname, "../../packages/shared");
    config.resolve.modules = [path.resolve(__dirname, "../../"), "node_modules"];
    return config;
  },
};
