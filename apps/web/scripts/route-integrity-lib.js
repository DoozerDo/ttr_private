const INTERNAL_PATH_PREFIX = "/";

function normalizeRoutePath(rawPath) {
  if (!rawPath) return null;
  const trimmed = rawPath.trim();
  if (!trimmed.startsWith(INTERNAL_PATH_PREFIX)) return null;
  if (trimmed.startsWith("//")) return null;
  if (trimmed.startsWith("/#")) return null;
  if (trimmed.startsWith("/mailto:")) return null;
  if (trimmed.startsWith("/tel:")) return null;
  const withoutQuery = trimmed.split("?")[0]?.split("#")[0] ?? trimmed;
  if (!withoutQuery) return null;
  return withoutQuery.endsWith("/") && withoutQuery !== "/"
    ? withoutQuery.slice(0, -1)
    : withoutQuery;
}

function toRouteFromPageFile(relativeFilePath) {
  const normalized = relativeFilePath.replace(/\\/g, "/");
  const withoutPage = normalized
    .replace(/^page\.(tsx|ts|jsx|js|mdx)$/, "")
    .replace(/\/page\.(tsx|ts|jsx|js|mdx)$/, "");
  const segments = withoutPage
    .split("/")
    .filter(Boolean)
    .filter((segment) => !/^\(.+\)$/.test(segment));
  const route = `/${segments.join("/")}`;
  return route === "/" ? "/" : route.replace(/\/+/g, "/");
}

function toApiRouteFromHandlerFile(relativeFilePath) {
  const normalized = relativeFilePath.replace(/\\/g, "/");
  const withoutRoute = normalized.replace(/\/route\.(tsx|ts|jsx|js|mdx)$/, "");
  const segments = withoutRoute.split("/").filter(Boolean);
  const route = `/api/${segments.join("/")}`;
  return route.replace(/\/+/g, "/");
}

function isDynamicRoute(route) {
  return /\[[^\]]+\]/.test(route);
}

function routePatternToRegex(routePattern) {
  const escaped = routePattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const withDynamic = escaped.replace(/\\\[\.{3}[^\]]+\\\]/g, "(.+)");
  const finalPattern = withDynamic.replace(/\\\[[^\]]+\\\]/g, "([^/]+)");
  return new RegExp(`^${finalPattern}$`);
}

function matchesRoutePattern(routePattern, concretePath) {
  if (routePattern === concretePath) return true;
  if (!isDynamicRoute(routePattern)) return false;
  return routePatternToRegex(routePattern).test(concretePath);
}

function extractRouteReferencesFromSource(sourceText) {
  const refs = [];
  const add = (kind, target) => {
    const normalized = normalizeRoutePath(target);
    if (!normalized) return;
    refs.push({ kind, target: normalized });
  };

  const patterns = [
    { kind: "link", regex: /<Link[^>]*\shref=["'`]([^"'`]+)["'`]/g },
    { kind: "router_push", regex: /router\.push\(\s*["'`]([^"'`]+)["'`]/g },
    { kind: "router_replace", regex: /router\.replace\(\s*["'`]([^"'`]+)["'`]/g },
    { kind: "window_location", regex: /window\.location(?:\.href)?\s*=\s*["'`]([^"'`]+)["'`]/g },
    { kind: "fetch", regex: /fetch\(\s*["'`]([^"'`]+)["'`]/g },
  ];

  for (const { kind, regex } of patterns) {
    let match = regex.exec(sourceText);
    while (match) {
      add(kind, match[1]);
      match = regex.exec(sourceText);
    }
  }

  return refs;
}

function classifyReferenceTarget(target, pageRoutes, apiRoutes) {
  if (target.startsWith("/api/")) {
    const exactApi = apiRoutes.find((route) => route === target);
    if (exactApi) return { type: "api_route", matchedRoute: exactApi };
    const dynamicApi = apiRoutes.find((route) => matchesRoutePattern(route, target));
    if (dynamicApi) return { type: "dynamic_api_route", matchedRoute: dynamicApi };
    return { type: "missing_api_route", matchedRoute: null };
  }

  const exactPage = pageRoutes.find((route) => route === target);
  if (exactPage) return { type: "page_route", matchedRoute: exactPage };
  const dynamicPage = pageRoutes.find((route) => matchesRoutePattern(route, target));
  if (dynamicPage) return { type: "dynamic_page_route", matchedRoute: dynamicPage };
  return { type: "missing_page_route", matchedRoute: null };
}

function detectOrphanedRoutes(pageRoutes, referencedTargets, options = {}) {
  const excluded = new Set(options.excludedRoutes ?? []);
  const refs = new Set(referencedTargets);
  return pageRoutes
    .filter((route) => !excluded.has(route))
    .filter((route) => !isDynamicRoute(route))
    .filter((route) => !refs.has(route))
    .map((route) => ({ route, classification: "likely_orphaned" }));
}

module.exports = {
  classifyReferenceTarget,
  detectOrphanedRoutes,
  extractRouteReferencesFromSource,
  isDynamicRoute,
  matchesRoutePattern,
  normalizeRoutePath,
  toApiRouteFromHandlerFile,
  toRouteFromPageFile,
};
