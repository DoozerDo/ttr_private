import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RunYourAnalysisSection } from "@/src/components/landing/RunYourAnalysisSection";

describe("RunYourAnalysisSection", () => {
  it("logs and does not silently no-op when the Check fit handler throws", async () => {
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
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

    expect(consoleLogSpy).toHaveBeenCalledWith("CHECK_FIT_CLICK_HANDLER_ENTERED");
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(String(consoleErrorSpy.mock.calls[0]?.[0] ?? "")).toContain("[landing-checkfit] analyze click failed");

    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("logs entry but does not call the handler when disabled conditions are met", async () => {
    const onAnalyzeCompatibility = vi.fn();
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    render(
      <RunYourAnalysisSection
        jobDescription={""}
        onJobDescriptionChange={() => undefined}
        onJobDescriptionFocus={() => undefined}
        resumeFilename={null}
        onResumeUploadInitiated={() => undefined}
        onResumeFileSelected={() => undefined}
        onAnalyzeCompatibility={onAnalyzeCompatibility}
        isPreviewLoading={false}
        jdReady={false}
        previewError={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Check fit" }));
    await Promise.resolve();

    expect(consoleLogSpy).toHaveBeenCalledWith("CHECK_FIT_CLICK_HANDLER_ENTERED");
    expect(onAnalyzeCompatibility).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });
});
