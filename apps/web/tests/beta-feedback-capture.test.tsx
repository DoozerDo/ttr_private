import { render } from "@testing-library/react";

import { BetaFeedbackCapture } from "@/app/(app)/components/BetaFeedbackCapture";

describe("BetaFeedbackCapture", () => {
  it("does not render a visible entrypoint", () => {
    const { container } = render(<BetaFeedbackCapture />);
    expect(container).toBeEmptyDOMElement();
  });
});

