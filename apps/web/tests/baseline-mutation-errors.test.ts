import { describe, expect, it } from "vitest";

import { BaselineMutationError, describeBaselineMutationError } from "@/lib/baselines";

describe("baseline mutation error mapping", () => {
  it("maps archived baseline mutation failures to specific user-facing messages", () => {
    expect(
      describeBaselineMutationError(
        new BaselineMutationError("Archive", 401, "unauthorized", null),
        "archive",
      ),
    ).toBe("Your session expired. Refresh and try again.");

    expect(
      describeBaselineMutationError(
        new BaselineMutationError("Archive", 404, "missing", null),
        "archive",
      ),
    ).toBe("We couldn't find that baseline.");

    expect(
      describeBaselineMutationError(
        new BaselineMutationError("Archive", 503, "upstream error", null),
        "archive",
      ),
    ).toBe("We couldn't archive this baseline. Try again.");
  });

  it("keeps network failures connection-oriented and preserves raw messages otherwise", () => {
    expect(describeBaselineMutationError(new Error("fetch failed"), "archive")).toContain(
      "connection",
    );
    expect(describeBaselineMutationError(new Error("custom failure"), "archive")).toBe(
      "custom failure",
    );
  });
});
