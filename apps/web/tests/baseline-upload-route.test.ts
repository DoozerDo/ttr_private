import { NextRequest } from "next/server";
import { vi } from "vitest";

import { POST } from "@/app/api/baselines/route";
import { setFetchImplementation } from "@/tests/setup";

function createStream(payload: string) {
  const bytes = new TextEncoder().encode(payload);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

describe("baseline upload API route", () => {
  afterEach(() => {
    delete process.env.API_BASE_URL;
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
  });

  it("forwards multipart uploads as a raw stream and preserves the boundary", async () => {
    const fetchSpy = vi.fn(async (_input: RequestInfo, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect((init?.headers as Record<string, string>)?.Authorization).toBe("Bearer test-token");
      expect((init?.headers as Record<string, string>)?.["content-type"]).toContain("multipart/form-data");
      expect((init?.headers as Record<string, string>)?.["content-type"]).toContain("boundary=----unit-test");
      // Streaming bodies in Node require duplex=half.
      expect((init as any)?.duplex).toBe("half");
      expect(init?.body).toBeTruthy();

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    setFetchImplementation(fetchSpy as unknown as typeof fetch);
    process.env.API_BASE_URL = "http://upstream.test";

    const boundary = "----unit-test";
    const request = new NextRequest("http://localhost/api/baselines", {
      method: "POST",
      headers: {
        cookie: "access_token=test-token",
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      body: createStream("--fake-multipart--") as any,
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("/baselines");
  });
});

