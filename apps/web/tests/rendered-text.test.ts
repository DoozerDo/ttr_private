import { describe, expect, it } from "vitest";

import {
  FALLBACK_RENDERED_TEXT,
  sanitizeRenderedTextList,
  sanitizeRenderedTextValue,
} from "@/lib/renderedText";

describe("rendered text sanitizer", () => {
  it("preserves clean text and strips control characters", () => {
    expect(
      sanitizeRenderedTextValue("Hello\u0000 world", {
        endpoint: "/api/test",
        field: "summary",
      }),
    ).toBe("Hello world");
  });

  it("falls back for unresolved tokens and bare math fragments", () => {
    expect(
      sanitizeRenderedTextValue("result {{broken}} ${value} 2 + 2 = 4", {
        endpoint: "/api/test",
        field: "summary",
      }),
    ).toBe(FALLBACK_RENDERED_TEXT);
  });

  it("filters invalid list items without leaking corrupted text", () => {
    const items = sanitizeRenderedTextList(
      ["clean signal", "{{broken}}", "another signal", "\u0000partial"],
      {
        endpoint: "/api/test",
        field: "signals",
      },
    );

    expect(items).toEqual(["clean signal", "another signal", "partial"]);
    expect(items.some((item) => /\{\{/.test(item))).toBe(false);
  });
});
