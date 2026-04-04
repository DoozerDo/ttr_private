import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { GET as getInterviews, POST as postInterviews } from "@/app/api/interviews/route";
import { POST as startInterview } from "@/app/api/interviews/start/route";
import { POST as postResponses } from "@/app/api/interviews/[id]/responses/route";
import { PATCH as patchAcceptedAdditions } from "@/app/api/interviews/[id]/accepted-additions/route";
import { GET as getLatestFit } from "@/app/api/analysis/job/[jobId]/latest/route";
import { GET as getRecommendedAdditions } from "@/app/api/interviews/[id]/recommended-additions/route";
import { POST as postDecisions } from "@/app/api/interviews/[id]/decisions/route";
import { POST as postComputeExpandedFit } from "@/app/api/interviews/[id]/compute-expanded-fit/route";
import { POST as postPromoteAcceptedAdditions } from "@/app/api/interviews/[id]/promote-accepted-additions/route";
import { POST as postResumeGenerate } from "@/app/api/resume/route";

const apiBaseUrl = "https://api.example.com";

function request(path: string, method = "GET", body?: unknown) {
  const headers = new Headers();
  headers.append("cookie", `${AUTH_COOKIE_NAME}=token-1`);
  if (body !== undefined) {
    headers.append("Content-Type", "application/json");
  }

  return new NextRequest(`https://web.example.com${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("interviews proxy routes", () => {
  beforeEach(() => {
    process.env.API_BASE_URL = apiBaseUrl;
  });

  afterEach(() => {
    delete process.env.API_BASE_URL;
    vi.restoreAllMocks();
  });

  it("routes interview list and create to interview-records", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify([{ id: "int-1" }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getInterviews(request("/api/interviews"));
    await postInterviews(
      request("/api/interviews", "POST", {
        jobId: "job-1",
        baselineVersionId: "bv-1",
      }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${apiBaseUrl}/interview-records`,
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${apiBaseUrl}/interview-records`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("routes start to canonical interview-records start endpoint", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "int-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await startInterview(
      request("/api/interviews/start", "POST", {
        jobId: "job-1",
        baselineVersionId: "bv-1",
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/interview-records/start`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("normalizes legacy response payload and patches interview-records", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "int-1", responses: ["A", "B"] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await postResponses(
      request("/api/interviews/int-1/responses", "POST", {
        responses: [
          { question: "Q1", response: "A" },
          { question: "Q2", response: "B" },
        ],
      }),
      { params: Promise.resolve({ id: "int-1" }) },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/interview-records/int-1`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ responses: ["A", "B"] }),
      }),
    );
  });

  it("routes accepted additions updates via canonical patch endpoint", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "int-1", acceptedAdditionIds: ["a1"] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await patchAcceptedAdditions(
      request("/api/interviews/int-1/accepted-additions", "PATCH", {
        acceptedAdditionIds: ["a1"],
      }),
      { params: Promise.resolve({ id: "int-1" }) },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/interview-records/int-1/accepted-additions`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ acceptedAdditionIds: ["a1"] }),
      }),
    );
  });

  it("runs canonical low-fit recovery loop through promotion and artifact readiness", async () => {
    const interviewId = "int-canary-1";
    const promotedBaselineVersionId = "bv-promoted-2";

    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";

      if (url === `${apiBaseUrl}/analysis/job/job-77/latest` && init?.method === "GET") {
        return new Response(
          JSON.stringify({
            id: "fit-1",
            jobId: "job-77",
            baselineVersionId: "bv-1",
            verdict: "underfit",
            score: 42,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url === `${apiBaseUrl}/interview-records/start` && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            id: interviewId,
            jobId: "job-77",
            baselineVersionId: "bv-1",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url === `${apiBaseUrl}/interview-records/${interviewId}` && init?.method === "PATCH") {
        return new Response(
          JSON.stringify({
            id: interviewId,
            responses: ["I led a migration for 3 teams."],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (
        url === `${apiBaseUrl}/interview-records/${interviewId}/recommended-additions` &&
        (!init?.method || init.method === "GET")
      ) {
        return new Response(
          JSON.stringify([{ id: "add-1", title: "Multi-team platform migration leadership" }]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url === `${apiBaseUrl}/interview-records/${interviewId}/decisions` && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            id: interviewId,
            decisions: [{ additionId: "add-1", decision: "accept" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (
        url === `${apiBaseUrl}/interview-records/${interviewId}/accepted-additions` &&
        init?.method === "PATCH"
      ) {
        return new Response(
          JSON.stringify({
            id: interviewId,
            acceptedAdditionIds: ["add-1"],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (
        url === `${apiBaseUrl}/interview-records/${interviewId}/compute-expanded-fit` &&
        init?.method === "POST"
      ) {
        return new Response(
          JSON.stringify({
            id: interviewId,
            expandedFit: { score: 74, verdict: "qualified" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (
        url === `${apiBaseUrl}/interview-records/${interviewId}/promote-accepted-additions` &&
        init?.method === "POST"
      ) {
        return new Response(
          JSON.stringify({
            id: interviewId,
            promotedBaselineVersionId,
            acceptedAdditionIds: ["add-1"],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url === `${apiBaseUrl}/resume/generate` && init?.method === "POST") {
        const payload =
          typeof init.body === "string" ? JSON.parse(init.body) : (init.body as Record<string, unknown>);

        return new Response(
          JSON.stringify({
            status: "success",
            generationStatus: "success",
            exportReady: true,
            baselineVersionId: payload?.baselineVersionId,
            exports: { docx: true, pdf: true },
            preview: {
              resume: {
                heading: {
                  name: "Test Candidate",
                  contactLine: "test@example.com | (555) 555-0100",
                },
                experience: [
                  {
                    company: "Cat Daddy Games",
                    roleTitle: "Senior Producer",
                    bullets: ["Led game operations and live-ops delivery cadence."],
                  },
                ],
                education: [],
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      return new Response(JSON.stringify({ error: "unexpected fetch target" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const fitResponse = await getLatestFit(request("/api/analysis/job/job-77/latest"), {
      params: Promise.resolve({ jobId: "job-77" }),
    });
    const fitPayload = await fitResponse.json();
    expect(fitPayload.verdict).toBe("underfit");

    const startResponse = await startInterview(
      request("/api/interviews/start", "POST", {
        jobId: "job-77",
        baselineVersionId: "bv-1",
        fitAssessmentId: "fit-1",
      }),
    );
    const startPayload = await startResponse.json();
    expect(startPayload.id).toBe(interviewId);

    await postResponses(
      request(`/api/interviews/${interviewId}/responses`, "POST", {
        responses: [{ question: "Q1", response: "I led a migration for 3 teams." }],
      }),
      { params: Promise.resolve({ id: interviewId }) },
    );

    const recommendedResponse = await getRecommendedAdditions(
      request(`/api/interviews/${interviewId}/recommended-additions`),
      { params: Promise.resolve({ id: interviewId }) },
    );
    const recommendedPayload = await recommendedResponse.json();
    expect(recommendedPayload).toHaveLength(1);
    expect(recommendedPayload[0]?.id).toBe("add-1");

    await postDecisions(
      request(`/api/interviews/${interviewId}/decisions`, "POST", {
        decisions: [{ additionId: "add-1", decision: "accept" }],
      }),
      { params: Promise.resolve({ id: interviewId }) },
    );

    const acceptedResponse = await patchAcceptedAdditions(
      request(`/api/interviews/${interviewId}/accepted-additions`, "PATCH", {
        acceptedAdditionIds: ["add-1"],
      }),
      { params: Promise.resolve({ id: interviewId }) },
    );
    const acceptedPayload = await acceptedResponse.json();
    expect(acceptedPayload.acceptedAdditionIds).toEqual(["add-1"]);

    const expandedFitResponse = await postComputeExpandedFit(
      request(`/api/interviews/${interviewId}/compute-expanded-fit`, "POST", {}),
      { params: Promise.resolve({ id: interviewId }) },
    );
    const expandedFitPayload = await expandedFitResponse.json();
    expect(expandedFitPayload.expandedFit).toEqual({ score: 74, verdict: "qualified" });

    const promoteResponse = await postPromoteAcceptedAdditions(
      request(`/api/interviews/${interviewId}/promote-accepted-additions`, "POST", {}),
      { params: Promise.resolve({ id: interviewId }) },
    );
    const promotePayload = await promoteResponse.json();
    expect(promotePayload.promotedBaselineVersionId).toBe(promotedBaselineVersionId);

    const resumeResponse = await postResumeGenerate(
      request("/api/resume", "POST", {
        jobId: "job-77",
        baselineVersionId: promotePayload.promotedBaselineVersionId,
      }),
    );
    const resumePayload = await resumeResponse.json();
    expect(resumePayload.status).toBe("success");
    expect(resumePayload.baselineVersionId).toBe(promotedBaselineVersionId);
    expect(resumePayload.preview?.resume?.experience?.[0]?.company).toBe("Cat Daddy Games");

    const calledUrls = fetchMock.mock.calls.map(([input]) =>
      typeof input === "string" ? input : input?.url ?? "",
    );
    const canonicalInterviewCalls = calledUrls.filter((url) =>
      url.startsWith(`${apiBaseUrl}/interview-records/${interviewId}`),
    );

    expect(canonicalInterviewCalls.length).toBeGreaterThanOrEqual(5);
    expect(calledUrls).toContain(`${apiBaseUrl}/interview-records/start`);
    expect(calledUrls).toContain(`${apiBaseUrl}/interview-records/${interviewId}/compute-expanded-fit`);
    expect(calledUrls).toContain(
      `${apiBaseUrl}/interview-records/${interviewId}/promote-accepted-additions`,
    );
    expect(calledUrls).toContain(`${apiBaseUrl}/resume/generate`);
    expect(calledUrls.some((url) => /\/interviews(\/|$)/.test(url))).toBe(false);
  });

  it("returns 502 when resume route receives a non-resume payload", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url === `${apiBaseUrl}/resume/generate` && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            overallScore: 77,
            gapAnalysis: { criticalGaps: ["Needs leadership examples"] },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "unexpected fetch target" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    });

    vi.stubGlobal("fetch", fetchMock);
    const response = await postResumeGenerate(
      request("/api/resume", "POST", {
        jobId: "job-1",
        baselineId: "base-1",
        baselineVersionId: "base-version-1",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body?.error?.code).toBe("RESUME_GENERATION_CONTRACT_MISMATCH");
  });
});
