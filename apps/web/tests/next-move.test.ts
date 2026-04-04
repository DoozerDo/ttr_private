import { getNextMove } from "@/lib/nextMove";

describe("getNextMove", () => {
  it("returns generate move for scores above 85", () => {
    expect(getNextMove(86)).toMatchObject({
      action: "generate",
      ctaText: "Generate Resume & Cover Letter",
    });
  });

  it("returns studio move for scores 70 to 85", () => {
    expect(getNextMove(85)).toMatchObject({ action: "studio", ctaText: "Open Studio" });
    expect(getNextMove(70)).toMatchObject({ action: "studio", ctaText: "Open Studio" });
  });

  it("returns improve move for scores 50 to 69", () => {
    expect(getNextMove(69)).toMatchObject({ action: "improve", ctaText: "Start Fit Improvement" });
    expect(getNextMove(50)).toMatchObject({ action: "improve", ctaText: "Start Fit Improvement" });
  });

  it("returns stop move for scores below 50", () => {
    expect(getNextMove(49)).toMatchObject({ action: "stop", ctaText: "Review Gaps" });
  });
});
