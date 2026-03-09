import { render } from "@testing-library/react";
import { JourneyProgressIcon } from "@/src/components/icons/JourneyProgressIcon";

describe("JourneyProgressIcon", () => {
  it.each([
    { stage: 1 as const },
    { stage: 2 as const },
    { stage: 3 as const },
    { stage: 4 as const },
  ])(
    "renders mature stage icon without legacy ring/target layers for stage $stage",
    ({ stage }) => {
      const { container } = render(<JourneyProgressIcon stage={stage} />);
      const icon = container.querySelector("svg[role='presentation']");
      expect(icon).toBeInTheDocument();
      expect(icon.querySelector("[data-testid='journey-progress-arrow']")).toBeNull();
      expect(icon.querySelector("[data-testid='journey-progress-ring-outer']")).toBeNull();
      expect(icon.querySelector("[data-testid='journey-progress-ring-inner']")).toBeNull();
      expect(icon.querySelector("[data-testid='journey-progress-bullseye']")).toBeNull();
    },
  );
});
