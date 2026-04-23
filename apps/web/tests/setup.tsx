import type { ReactNode } from "react";
import { afterEach, vi } from "vitest";

import "@testing-library/jest-dom";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { __resetStudioArtifactSingleFlightForTests } from "@/lib/studioArtifactSingleFlight";

// Keep a stable URLSearchParams-like shape.
// The key fix is: `get` must accept an optional key so it matches both:
// - our default mock `get: () => null`
// - overrides that implement `get(key: string): string | null`
type MockSearchParams = {
  get: (key?: string) => string | null;
  toString: () => string;
};

const mockSearchParams = vi.fn<[], MockSearchParams>(() => ({
  get: (_key?: string) => null,
  toString: () => "",
}));

export const mockRouterPush = vi.fn();
export const mockRouterReplace = vi.fn();
export const mockRouterRefresh = vi.fn();
export const mockPathname = vi.fn(() => "/");
export const mockUseParams = vi.fn(() => ({}));
export const mockNotFound = vi.fn();
export const mockRedirect = vi.fn();

const matchMediaMock = (_query: string): MediaQueryList =>
  ({
    matches: false,
    media: _query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  } as MediaQueryList);

if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = matchMediaMock;
}

if (typeof globalThis !== "undefined" && !globalThis.matchMedia) {
  (globalThis as typeof window).matchMedia = matchMediaMock;
}

const mockHeaderGet = vi.fn((_name: string) => null);
const mockHeaders = { get: mockHeaderGet };
const mockCookieStore = {
  get: (name: string) => {
    if (name === AUTH_COOKIE_NAME) {
      return { value: "test-token" };
    }
    return undefined;
  },
};

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(mockHeaders),
  cookies: () => Promise.resolve(mockCookieStore),
}));

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, ...rest }: { children?: ReactNode }) => (
    <a {...rest}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: mockRouterReplace,
    refresh: mockRouterRefresh,
  }),
  useSearchParams: () => mockSearchParams(),
  usePathname: () => mockPathname(),
  useParams: () => mockUseParams(),
  notFound: mockNotFound,
  redirect: mockRedirect,
}));

function createResponse(
  body: unknown,
  ok = true,
  status = ok ? 200 : 500,
  textOverride?: string,
) {
  const stringBody =
    typeof body === "string"
      ? body
      : body === undefined
        ? ""
        : JSON.stringify(body);

  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(textOverride ?? stringBody),
  };
}

const defaultFetch = vi.fn((input: RequestInfo) => {
  const url = typeof input === "string" ? input : input?.url ?? "";

  if (url.includes("/api/baselines")) {
    return Promise.resolve(createResponse([]));
  }

  if (url.includes("/api/jobs")) {
    return Promise.resolve(createResponse([]));
  }

  if (url.includes("/api/status") || url.includes("/api/health")) {
    return Promise.resolve(createResponse({ status: "ok" }));
  }

  return Promise.resolve(createResponse({}));
});

function setDefaultFetch() {
  (globalThis.fetch as typeof globalThis.fetch) =
    defaultFetch as unknown as typeof globalThis.fetch;
}

setDefaultFetch();

export function overrideSearchParams(values: Record<string, string | null>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== null) {
      params.set(key, value);
    }
  });

  mockSearchParams.mockReturnValue({
    get: (key?: string) => {
      if (!key) return null;
      if (Object.prototype.hasOwnProperty.call(values, key)) {
        return values[key];
      }
      return null;
    },
    toString: () => params.toString(),
  });
}

export function resetSearchParams() {
  mockSearchParams.mockReturnValue({
    get: (_key?: string) => null,
    toString: () => "",
  });
}

export function setFetchImplementation(custom: typeof defaultFetch) {
  (globalThis.fetch as typeof globalThis.fetch) =
    custom as unknown as typeof globalThis.fetch;
}

afterEach(() => {
  defaultFetch.mockClear();
  mockRouterPush.mockClear();
  mockRouterReplace.mockClear();
  mockRouterRefresh.mockClear();
  mockPathname.mockClear();
  mockPathname.mockReturnValue("/");
  resetSearchParams();
  setDefaultFetch();
  mockUseParams.mockReturnValue({});
  mockUseParams.mockClear();
  mockNotFound.mockClear();
  mockRedirect.mockClear();
  if (
    typeof localStorage !== "undefined" &&
    typeof (localStorage as Storage).clear === "function"
  ) {
    localStorage.clear();
  }
  if (
    typeof sessionStorage !== "undefined" &&
    typeof (sessionStorage as Storage).clear === "function"
  ) {
    sessionStorage.clear();
  }
  __resetStudioArtifactSingleFlightForTests();
});
