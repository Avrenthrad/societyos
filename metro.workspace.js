// Shared Metro setup for every app in apps/.
// The shared packages use ESM-style imports ("./dates.js") that point at .ts
// files, which tsc and vitest understand but Metro does not. Retry those
// without the extension so Metro finds the .ts file.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const packagesDir = `${path.sep}packages${path.sep}`;

module.exports = function workspaceConfig(appDir) {
  const config = getDefaultConfig(appDir);
  const upstream = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (ctx, name, platform) => {
    const resolve = upstream ?? ctx.resolveRequest;
    if (name.startsWith(".") && name.endsWith(".js") && ctx.originModulePath.includes(packagesDir)) {
      try {
        return resolve(ctx, name.slice(0, -3), platform);
      } catch {
        // fall through to the name as written
      }
    }
    return resolve(ctx, name, platform);
  };
  return config;
};
