import {
  sanitizeScoreExplanationLine,
  sanitizeScoreExplanationList,
} from "@/lib/scoreExplanationCopy";

describe("score explanation copy sanitization", () => {
  it("normalizes RTOS casing and removes malformed possessives", () => {
    expect(sanitizeScoreExplanationLine("Rust rtos’s and toolchains", "gap")).toBe(
      "Rust RTOS and toolchains",
    );
  });

  it("rejects employer mission and recruiting boilerplate", () => {
    expect(
      sanitizeScoreExplanationLine(
        "At microsoft, our mission—to empower every person and every organization",
        "gap",
      ),
    ).toBeNull();
    expect(
      sanitizeScoreExplanationLine("We are looking for someone to join our team", "gap"),
    ).toBeNull();
  });

  it("compresses long mushy strengths into concise evidence-oriented copy", () => {
    expect(
      sanitizeScoreExplanationLine(
        "Strong cross-functional influencing and collaboration skills that include fostering buy-in across multiple stakeholder groups.",
        "strength",
      ),
    ).toBeNull();

    expect(
      sanitizeScoreExplanationLine(
        "Partnered with product and engineering teams on release planning across support operations and launch readiness programs.",
        "strength",
      ),
    ).toBe("Partnered with product and engineering teams on release planning across support operations");
  });

  it("preserves known acronyms and proper company casing", () => {
    expect(
      sanitizeScoreExplanationLine(
        "partnered with microsoft teams on api, sdk, sql and cx systems",
        "strength",
      ),
    ).toBe("Partnered with Microsoft teams on API, SDK, SQL and CX systems");
  });

  it("skips low-quality signals and keeps the next best clean copy", () => {
    expect(
      sanitizeScoreExplanationList(
        [
          "Qualifications",
          "At microsoft, our mission—to empower every person and every organization",
          "Built cross-functional operating processes for customer support",
        ],
        "strength",
        3,
      ),
    ).toEqual(["Built cross-functional operating processes for customer support"]);
  });
});
