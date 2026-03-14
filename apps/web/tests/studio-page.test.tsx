import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { vi } from "vitest";

import StudioPage from "@/app/(app)/studio/page";
import { EntitlementsProvider } from "@/src/lib/entitlements";
import { setFetchImplementation } from "./setup";

vi.mock("@/app/(app)/studio/BaselineBlockPolicyPanel", () => ({
  BaselineBlockPolicyPanel: () => null,
}));

vi.mock("@/lib/jobsClient", () => ({
  listJobs: vi.fn(async () => [
    {
      id: "job-1",
      company: "Acme",
      title: "Director of Support",
      archivedAt: null,
      isArchived: false,
    },
  ]),
}));

vi.mock("@/lib/baselines", async () => {
  const actual = await vi.importActual("@/lib/baselines");
  return {
    ...(actual as object),
    listBaselines: vi.fn(async () => [
      {
        id: "base-1",
        originalFilename: "Leadership Resume",
        version: 1,
      },
    ]),
  };
});

function renderStudio() {
  return render(
    <EntitlementsProvider
      entitlements={{
        id: "u-1",
        email: "test@example.com",
        subscriptionTier: "PRO",
        role: "user",
        entitlements: null,
      }}
    >
      <StudioPage />
    </EntitlementsProvider>,
  );
}

function createResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  const stringBody =
    typeof body === "string"
      ? body
      : body === undefined
        ? ""
        : JSON.stringify(body);

  return {
    ok,
    status,
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === "content-type") {
          return "application/json";
        }
        return null;
      },
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(stringBody),
    blob: () => Promise.resolve(new Blob([stringBody], { type: "application/json" })),
  };
}

describe("Studio page UX", () => {
  it("hides internal terms and metadata", async () => {
    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Targeting")).toBeInTheDocument();
    });

    expect(screen.queryByText(/^Job$/)).toBeNull();
    expect(screen.queryByText(/^Baseline$/)).toBeNull();
    expect(screen.queryByText("Baseline Version ID:")).toBeNull();
    expect(screen.queryByText("Artifact Readiness")).toBeNull();
    expect(screen.queryByText(/Using baseline/i)).toBeNull();
    expect(screen.queryByText(/^Confidence$/)).toBeNull();
  });

  it("renders why-this-focus and download options for both generation panels", async () => {
    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Why this focus")).toBeInTheDocument();
    });

    expect(screen.getAllByText("Generate Resume").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Generate Cover Letter").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Download: DOCX | PDF").length).toBe(2);
    expect(screen.getAllByRole("button", { name: "Download DOCX" }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole("button", { name: "Download PDF" }).length).toBeGreaterThanOrEqual(2);
  });

  it("shows a blocked compliance card without rendering raw JSON payloads", async () => {
    setFetchImplementation(
      vi.fn((input: RequestInfo) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/baselines/") && url.includes("/versions")) {
          return Promise.resolve(
            createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
          );
        }
        if (url.includes("/api/analysis/job/") && url.includes("/latest")) {
          return Promise.resolve(
            createResponse({ score: 78, baselineId: "base-1", baselineVersionId: "base-version-1" }),
          );
        }
        if (url.endsWith("/api/resume")) {
          return Promise.resolve(
            createResponse({
              status: "compliance_blocked",
              generationStatus: "blocked",
              safeDisplay: {
                title: "Resume blocked by compliance",
                description: "Verification required before this draft can be used.",
                reasons: ["Company reference needs verification"],
              },
              internal: {
                auditId: "audit-raw-123",
                baselineVersionHash: "internal-hash",
                complianceFlags: [{ code: "invented_company" }],
              },
            }),
          );
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate Resume" })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate Resume" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate Resume" }));

    await waitFor(() => {
      expect(screen.getAllByText("Resume blocked by compliance").length).toBeGreaterThan(0);
    });

    expect(screen.queryByText("audit-raw-123")).toBeNull();
    expect(screen.queryByText(/internal-hash/)).toBeNull();
    expect(screen.queryByText(/\\{\"status\"/)).toBeNull();
  });

  it("enables downloads only after successful generation and keeps blocked documents disabled", async () => {
    setFetchImplementation(
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/baselines/") && url.includes("/versions")) {
          return Promise.resolve(
            createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
          );
        }
        if (url.includes("/api/analysis/job/") && url.includes("/latest")) {
          return Promise.resolve(
            createResponse({ score: 82, baselineId: "base-1", baselineVersionId: "base-version-1" }),
          );
        }
        if (url.endsWith("/api/resume") && init?.method === "POST") {
          return Promise.resolve(
            createResponse({
              status: "success",
              generationStatus: "success",
              exportReady: true,
              exports: { docx: true, pdf: true },
              preview: {
                resume: {
                  heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
                  experience: [
                    {
                      company: "Cat Daddy Games",
                      roleTitle: "Senior Producer",
                      bullets: ["Led support operations programs."],
                    },
                  ],
                },
              },
              safeDisplay: {
                title: "Resume generated successfully",
                description: "Resume ready.",
              },
            }),
          );
        }
        if (url.endsWith("/api/cover-letters") && init?.method === "POST") {
          return Promise.resolve(
            createResponse({
              status: "blocked",
              generationStatus: "blocked",
              safeDisplay: {
                title: "Cover letter blocked by compliance",
                description: "Unsupported claims detected.",
                reasons: ["Role or title needs verification"],
              },
            }),
          );
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate Resume" })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate Resume" })).toBeEnabled();
    });

    const sections = screen.getAllByRole("heading", { name: /Generate/i });
    const resumeSection = sections[0]?.closest("section");
    const coverSection = sections[1]?.closest("section");
    if (!resumeSection || !coverSection) {
      throw new Error("Expected resume and cover sections");
    }

    expect(within(resumeSection).getByRole("button", { name: "Download DOCX" })).toBeDisabled();
    expect(within(coverSection).getByRole("button", { name: "Download DOCX" })).toBeDisabled();

    const resumeGenerateButton = within(resumeSection).getByRole("button", { name: "Generate Resume" });
    await waitFor(() => {
      expect(resumeGenerateButton).toBeEnabled();
    });
    fireEvent.click(resumeGenerateButton);
    await waitFor(() => {
      expect(within(resumeSection).getByText("Downloads are available.")).toBeInTheDocument();
    });
    expect(within(resumeSection).getByRole("button", { name: "Download DOCX" })).toBeEnabled();

    fireEvent.click(within(coverSection).getByRole("button", { name: "Generate Cover Letter" }));
    await waitFor(() => {
      expect(within(coverSection).getByText("Cover letter blocked by compliance")).toBeInTheDocument();
    });
    expect(within(coverSection).getByRole("button", { name: "Download DOCX" })).toBeDisabled();
  });

  it("shows a resume generation error when API returns non-resume payload", async () => {
    setFetchImplementation(
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/baselines/") && url.includes("/versions")) {
          return Promise.resolve(
            createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
          );
        }
        if (url.includes("/api/analysis/job/") && url.includes("/latest")) {
          return Promise.resolve(
            createResponse({ score: 82, baselineId: "base-1", baselineVersionId: "base-version-1" }),
          );
        }
        if (url.endsWith("/api/resume") && init?.method === "POST") {
          return Promise.resolve(
            createResponse(
              {
                error: {
                  code: "RESUME_GENERATION_CONTRACT_MISMATCH",
                  message: "Resume generation returned an unexpected payload shape.",
                },
              },
              false,
              502,
            ),
          );
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate Resume" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate Resume" }));

    await waitFor(() => {
      expect(screen.getByText("Resume unavailable")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Resume generation returned an unexpected payload shape."),
    ).toBeInTheDocument();
    expect(screen.queryByText("No resume generated yet")).toBeInTheDocument();
  });

  it("allows generation in non-production when promotion artifacts are not ready", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/") && url.includes("/versions")) {
        return Promise.resolve(createResponse([]));
      }
      if (url.includes("/api/analysis/job/") && url.includes("/latest")) {
        return Promise.resolve(createResponse({ score: 82, baselineId: "base-1" }));
      }
      if (url.endsWith("/api/resume") && init?.method === "POST") {
        return Promise.resolve(
          createResponse({
            status: "success",
            generationStatus: "success",
            exportReady: true,
            preview: {
              resume: {
                heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
                experience: [],
                education: [],
              },
            },
          }),
        );
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => {
      expect(screen.getAllByText("Prerequisites missing").length).toBeGreaterThanOrEqual(1);
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate Resume" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate Resume" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/resume",
        expect.objectContaining({ method: "POST" }),
      );
    });
    const postCall = fetchMock.mock.calls.find(
      ([url, requestInit]) => url === "/api/resume" && requestInit?.method === "POST",
    );
    expect(postCall).toBeDefined();
    const requestBody = postCall?.[1]?.body;
    expect(typeof requestBody).toBe("string");
    const parsedBody = JSON.parse(requestBody as string) as Record<string, unknown>;
    expect(parsedBody.baselineVersionId).toBeUndefined();
  });
});
