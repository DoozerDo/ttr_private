import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { StudioArtifactQualityPanel } from "@/app/(app)/studio/StudioArtifactQualityPanel";
import type { ArtifactClaimRef, ArtifactQualityModel } from "@/lib/artifactConfidence";

const claim: ArtifactClaimRef = {
  id: "resume:salesforce",
  text: "Salesforce ownership",
  baselineItem: "Led CRM ownership across support operations.",
  verificationStatus: "UNVERIFIED",
  artifactType: "resume",
};

const highModel: ArtifactQualityModel = {
  confidence: "HIGH",
  artifactScore: 94,
  missingEvidenceCount: 0,
  improvableClaims: [],
  totalClaimCount: 3,
  verifiedClaimCount: 3,
};

const mediumModel: ArtifactQualityModel = {
  confidence: "MEDIUM",
  artifactScore: 78,
  missingEvidenceCount: 2,
  improvableClaims: [claim],
  totalClaimCount: 3,
  verifiedClaimCount: 1,
};

describe("StudioArtifactQualityPanel", () => {
  it("renders strong output copy when confidence is high", () => {
    render(
      <StudioArtifactQualityPanel
        model={highModel}
        confidence="HIGH"
        onVerifyClaim={vi.fn()}
        onEditClaim={vi.fn()}
        onDismissClaim={vi.fn()}
      />,
    );

    expect(screen.getByText("Strong Output")).toBeInTheDocument();
    expect(screen.getByText("Built from verified experience")).toBeInTheDocument();
    expect(screen.getByText("Output strength")).toBeInTheDocument();
    expect(screen.getByText("94/100")).toBeInTheDocument();
    expect(screen.getByText("0 claims can be strengthened")).toBeInTheDocument();
  });

  it("renders usable output copy and improvable claims when confidence is medium", () => {
    const onVerifyClaim = vi.fn();
    const onEditClaim = vi.fn();
    const onDismissClaim = vi.fn();

    render(
      <StudioArtifactQualityPanel
        model={mediumModel}
        confidence="MEDIUM"
        onVerifyClaim={onVerifyClaim}
        onEditClaim={onEditClaim}
        onDismissClaim={onDismissClaim}
      />,
    );

    expect(screen.getByText("Usable Output")).toBeInTheDocument();
    expect(screen.getByText("Some claims are unverified. Strengthen for best results.")).toBeInTheDocument();
    expect(screen.getByText("78/100")).toBeInTheDocument();
    expect(screen.getByText("2 claims can be strengthened")).toBeInTheDocument();
    expect(screen.getByText("Salesforce ownership")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Verify this" }));
    expect(onVerifyClaim).toHaveBeenCalledWith(claim);
    fireEvent.click(screen.getByRole("button", { name: "Edit before verifying" }));
    expect(onEditClaim).toHaveBeenCalledWith(claim);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismissClaim).toHaveBeenCalledWith(claim);
  });
});
