import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { StudioArtifactQualityPanel } from "@/app/(app)/studio/StudioArtifactQualityPanel";
import type { ArtifactClaimRef, ArtifactQualityModel } from "@/lib/artifactConfidence";

describe("studio improve loop", () => {
  const claim: ArtifactClaimRef = {
    id: "resume:leadership-scope",
    text: "Leadership scope",
    baselineItem: "Managed a team of 12 across support operations.",
    verificationStatus: "UNVERIFIED",
    artifactType: "resume",
  };

  const model: ArtifactQualityModel = {
    confidence: "MEDIUM",
    artifactScore: 76,
    missingEvidenceCount: 1,
    improvableClaims: [claim],
    totalClaimCount: 2,
    verifiedClaimCount: 1,
  };

  it("renders improvable claims and lets the user route verification, edit, and dismiss actions", () => {
    const onVerifyClaim = vi.fn();
    const onEditClaim = vi.fn();
    const onDismissClaim = vi.fn();

    render(
      <StudioArtifactQualityPanel
        model={model}
        confidence="MEDIUM"
        onVerifyClaim={onVerifyClaim}
        onEditClaim={onEditClaim}
        onDismissClaim={onDismissClaim}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Verify this" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit before verifying" }));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(onVerifyClaim).toHaveBeenCalledWith(claim);
    expect(onEditClaim).toHaveBeenCalledWith(claim);
    expect(onDismissClaim).toHaveBeenCalledWith(claim);
  });
});
