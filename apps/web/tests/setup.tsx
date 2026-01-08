import type { ReactNode } from "react";
import { afterEach, vi } from "vitest";

import "@testing-library/jest-dom";

// Keep a stable URLSearchParams-like shape.
// The key fix is: `get` must accept an optional key so it matches both:
// - our default mock `get: () => null`
// - overrides that implement `get(key: string): string | null`
type MockSearchParams = {
  get: (key?: string) => string | null;
};

const mockSearchParams = vi.fn<[], MockSearchParams>(() => ({
  get: (_key?: string) => null,
}));

const mockRouterPush = vi.fn();
const mockPathname = vi.fn(() => "/");

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

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, ...rest }: { children?: ReactNode }) => (
    <a {...rest}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
  }),
  useSearchParams: () => mockSearchParams(),
  usePathname: () => mockPathname(),
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
  mockSearchParams.mockReturnValue({
    get: (key?: string) => {
      if (!key) return null;
      if (Object.prototype.hasOwnProperty.call(values, key)) {
        return values[key];
      }
      return null;
    },
  });
}

export function resetSearchParams() {
  mockSearchParams.mockReturnValue({
    get: (_key?: string) => null,
  });
}

export function setFetchImplementation(custom: typeof defaultFetch) {
  (globalThis.fetch as typeof globalThis.fetch) =
    custom as unknown as typeof globalThis.fetch;
}

afterEach(() => {
  defaultFetch.mockClear();
  mockRouterPush.mockClear();
  mockPathname.mockClear();
  mockPathname.mockReturnValue("/");
  resetSearchParams();
  setDefaultFetch();
});
