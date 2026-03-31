import { render, screen } from "@testing-library/react";

import { VerifiedGenerationTrustSummary } from "@/components/VerifiedGenerationTrustSummary";

describe("VerifiedGenerationTrustSummary", () => {
  it("renders the verified-evidence trust summary for cover letter output", () => {
    render(<VerifiedGenerationTrustSummary testId="studio-cover-trust-summary" />);

    expect(screen.getByTestId("studio-cover-trust-summary")).toBeInTheDocument();
    expect(screen.getByTestId("studio-cover-trust-summary")).toHaveTextContent(
      "Generated from verified evidence",
    );
    expect(screen.getByTestId("studio-cover-trust-summary")).toHaveTextContent(
      "Verified baseline used. Aligned to this role. Unsupported claims remain blocked.",
    );
  });
});
