import { afterEach, describe, expect, it, vi } from "vitest";

import { apiFetchJson, ApiResponseError } from "@/app/(app)/lib/api";
import * as timeoutModule from "@/lib/fetchWithTimeout";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("apiFetchJson timeout handling", () => {
  it("wraps a client timeout in an ApiResponseError with typed payload", async () => {
    vi.spyOn(timeoutModule, "fetchWithTimeout").mockRejectedValue(
      new timeoutModule.ClientRequestTimeoutError("analysis"),
    );

    const promise = apiFetchJson("/api/analysis/run");

    await expect(promise).rejects.toBeInstanceOf(ApiResponseError);
    await expect(promise).rejects.toMatchObject({
      status: 504,
      errorCode: "timeout",
      payload: {
        status: "timeout",
        operation: "analysis",
        retryable: true,
      },
    });
  });
});
