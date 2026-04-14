import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RunYourAnalysisSection } from "@/src/components/landing/RunYourAnalysisSection";

describe("RunYourAnalysisSection", () => {
  it("logs and does not silently no-op when the Check fit handler throws", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <RunYourAnalysisSection
        jobDescription={"a".repeat(200)}
        onJobDescriptionChange={() => undefined}
        onJobDescriptionFocus={() => undefined}
        resumeFilename={null}
        onResumeUploadInitiated={() => undefined}
        onResumeFileSelected={() => undefined}
        onAnalyzeCompatibility={() => {
          throw new Error("boom");
        }}
        isPreviewLoading={false}
        jdReady={true}
        previewError={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Check fit" }));

    // Give the async click handler a tick to run its catch block.
    await Promise.resolve();

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(String(consoleErrorSpy.mock.calls[0]?.[0] ?? "")).toContain("[landing-checkfit] analyze click failed");

    consoleErrorSpy.mockRestore();
  });
});

