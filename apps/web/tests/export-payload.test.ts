import { describe, expect, it } from "vitest";

import { buildExportPayload } from "@/app/(app)/lib/exportPayload";

if (false) {
  // @ts-expect-error unsupported document kinds should be rejected at compile time
  buildExportPayload({
    documentType: "invoice",
    oneTap: true,
  });

  // @ts-expect-error canonical fields must come through the shared helper
  buildExportPayload({
    documentType: "resume",
    oneTap: true,
    jobId: "job-1",
    resumeFocus: "Operational Leadership",
  });
}

describe("buildExportPayload", () => {
  it("builds the canonical resume export payload shape", () => {
    const payload = buildExportPayload({
      documentType: "resume",
      oneTap: true,
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      analysisId: "analysis-1",
      extra: {
        resumeFocus: "Operational Leadership",
        editedResume: {
          summary: "Support leader focused on scalable operations.",
          experience: [{ company: "Acme", roleTitle: "Director", bullets: ["Led support ops."] }],
        },
      },
    });

    expect(payload).toMatchObject({
      documentType: "resume",
      oneTap: true,
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      analysisId: "analysis-1",
      resumeFocus: "Operational Leadership",
    });
    expect(JSON.stringify(payload)).not.toContain("Generated from verified evidence");
    expect(JSON.stringify(payload)).not.toContain("Verified baseline used");
  });

  it("builds the canonical cover-letter export payload shape", () => {
    const payload = buildExportPayload({
      documentType: "cover_letter",
      oneTap: false,
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      analysisId: "analysis-1",
      extra: {
        closingTemplateKey: "standard",
        jobContext: {
          allowedCompanies: ["Acme"],
          allowedRoleTitles: ["Director of Support"],
        },
      },
    });

    expect(payload).toMatchObject({
      documentType: "cover_letter",
      oneTap: false,
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      analysisId: "analysis-1",
      closingTemplateKey: "standard",
    });
    expect(JSON.stringify(payload)).not.toContain("Generated from verified evidence");
    expect(JSON.stringify(payload)).not.toContain("Verified baseline used");
  });
});
