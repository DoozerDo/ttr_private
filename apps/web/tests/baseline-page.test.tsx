import { renderToStaticMarkup } from "react-dom/server";

import BaselinePage from "@/app/(app)/baseline/page";
import { setFetchImplementation } from "@/tests/setup";

const createResponse = (body: unknown, ok = true, status = ok ? 200 : 401) => ({
  ok,
  status,
  json: () => Promise.resolve(body),
});

describe("BaselinePage", () => {
  it("does not render the debug strip", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url ?? "";
      if (url.includes("/api/baselines") || url.includes("/api/jobs")) {
        return createResponse([]);
      }
      return createResponse({});
    });

    const element = await BaselinePage({ searchParams: {} });
    const markup = renderToStaticMarkup(<>{element}</>);
    expect(markup).not.toContain("debug baselineId");
  });
});
