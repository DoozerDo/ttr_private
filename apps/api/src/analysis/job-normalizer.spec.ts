import { normalizeJobDescription } from "./job-normalizer";

describe("job-normalizer", () => {
  test("extracts bullets under headings", () => {
    const fixture = `
Responsibilities
- Lead the cross-product go-to-market initiatives and coach peer leads.
- Build and maintain roadmap alignment documents that keep squads on course.

Requirements
- Must have 5+ years of experience managing programs in a SaaS context.
- Experience with stakeholder communication, automation, and reporting.
`;
    const { normalized, debug } = normalizeJobDescription(fixture);
    expect(normalized.responsibilities.length).toBeGreaterThan(0);
    expect(normalized.requirements.length).toBeGreaterThan(0);
    expect(normalized.meta.source).toBe("normalized");
    expect(debug.bulletsDetected).toBeGreaterThan(0);
    expect(debug.headingsDetected.length).toBeGreaterThanOrEqual(2);
  });

  test("falls back without headings", () => {
    const fixture = `You will lead customer-facing programs and partner across functions to deliver high-impact outcomes. Must have 5 years managing complex integrations and the ability to work with executive stakeholders.`;
    const { normalized, debug } = normalizeJobDescription(fixture);
    expect(normalized.meta.source).toBe("normalized");
    expect(
      normalized.responsibilities.length > 0 ||
        normalized.requirements.length > 0,
    ).toBe(true);
    if (
      normalized.responsibilities.length === 0 &&
      normalized.requirements.length === 0
    ) {
      expect(debug.fallbackSentenceSplitUsed).toBe(true);
    }
  });
});
