import { describe, expect, it } from "vitest";

import {
  CLIENT_TIMEOUT_MESSAGE,
  ClientRequestTimeoutError,
} from "@/lib/fetchWithTimeout";

describe("fetchWithTimeout helpers", () => {
  it("builds the canonical client timeout error payload", () => {
    const error = new ClientRequestTimeoutError("analysis");

    expect(error.message).toBe(CLIENT_TIMEOUT_MESSAGE);
    expect(error).toMatchObject({
      name: "ClientRequestTimeoutError",
      status: 504,
      payload: {
        status: "timeout",
        operation: "analysis",
        message: CLIENT_TIMEOUT_MESSAGE,
        retryable: true,
      },
    });
  });
});
