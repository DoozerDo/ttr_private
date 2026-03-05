import { render, screen } from "@testing-library/react";
import { JourneyProgressIcon } from "@/src/components/icons/JourneyProgressIcon";

describe("JourneyProgressIcon", () => {
  it.each([
    { stage: 1 as const, outer: "true", inner: "true", bullseye: "true" },
    { stage: 2 as const, outer: "false", inner: "true", bullseye: "true" },
    { stage: 3 as const, outer: "false", inner: "false", bullseye: "true" },
    { stage: 4 as const, outer: "false", inner: "false", bullseye: "false" },
  ])(
    "renders expected layer visibility for stage $stage",
    ({ stage, outer, inner, bullseye }) => {
      render(<JourneyProgressIcon stage={stage} />);

      expect(screen.getByTestId("journey-progress-arrow")).toHaveAttribute("aria-hidden", "false");
      expect(screen.getByTestId("journey-progress-ring-outer")).toHaveAttribute("aria-hidden", outer);
      expect(screen.getByTestId("journey-progress-ring-inner")).toHaveAttribute("aria-hidden", inner);
      expect(screen.getByTestId("journey-progress-bullseye")).toHaveAttribute("aria-hidden", bullseye);
    },
  );
});
