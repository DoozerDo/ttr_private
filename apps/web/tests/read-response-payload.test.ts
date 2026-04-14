import { describe, expect, it } from "vitest";

import { readResponsePayload } from "@/lib/compliance/parseComplianceError";

describe("readResponsePayload", () => {
  it("reads JSON from response-like objects even when headers are missing", async () => {
    const payload = { status: "blocked", reasons: ["missing evidence"] };
    const responseLike = {
      json: () => Promise.resolve(payload),
      text: () => Promise.resolve(JSON.stringify(payload)),
    } as unknown as Response;

    await expect(readResponsePayload(responseLike)).resolves.toEqual(payload);
  });

  it("falls back to text when JSON parsing is unavailable", async () => {
    const responseLike = {
      text: () => Promise.resolve("service unavailable"),
    } as unknown as Response;

    await expect(readResponsePayload(responseLike)).resolves.toBe("service unavailable");
  });
});
