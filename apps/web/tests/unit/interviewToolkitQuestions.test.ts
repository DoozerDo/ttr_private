import { describe, expect, it } from "vitest";

import {
  type DiagnosticSignal,
  transformSignalsToInterviewQuestions,
} from "@/lib/interviewToolkit/questions";

describe("transformSignalsToInterviewQuestions", () => {
  it("filters low severity signals", () => {
    const questions = transformSignalsToInterviewQuestions([
      { signalLabel: "Leadership signal is muted", severity: "LOW" },
      { signalLabel: "Leadership signal is muted", severity: "MEDIUM" },
    ]);

    expect(questions).toHaveLength(1);
    expect(questions[0].severity).toBe("MEDIUM");
  });

  it("limits the number of signals per dimension", () => {
    const signals: DiagnosticSignal[] = [
      { signalLabel: "Leadership signal is muted", confidence: 0.2 },
      { signalLabel: "Leadership signal is muted", confidence: 0.8 },
      { signalLabel: "Leadership signal is muted", confidence: 0.6 },
    ];
    const questions = transformSignalsToInterviewQuestions(signals);

    expect(questions).toHaveLength(2);
    expect(questions[0].confidence).toBe(0.8);
    expect(questions[1].confidence).toBe(0.6);
  });

  it("orders by severity then confidence", () => {
    const questions = transformSignalsToInterviewQuestions([
      { signalLabel: "Customer impact signal is weak", severity: "MEDIUM", confidence: 0.5 },
      { signalLabel: "Leadership signal is muted", severity: "HIGH", confidence: 0.1 },
      { signalLabel: "Industry context feels misaligned", severity: "MEDIUM", confidence: 0.9 },
    ]);

    expect(questions[0].group).toBe("Leadership and ownership");
    expect(questions[1].confidence).toBe(0.9);
    expect(questions[2].confidence).toBe(0.5);
  });

  it("returns canonical questions without exposing system language", () => {
    const questions = transformSignalsToInterviewQuestions([
      "Leadership signal is muted",
    ]);

    expect(questions[0].primary).toContain("Can you walk me through");
    expect(questions[0].followUp).toContain("What was hardest about leading");
    expect(questions[0].reason).not.toMatch(/signal/i);
    expect(questions[0].focusFirst).toBe(true);
  });

  it("respects a total results cap", () => {
    const inputs = [
      "Leadership signal is muted",
      "Strategy orientation needs reinforcement",
      "Industry context feels misaligned",
      "Customer impact signal is weak",
    ];

    const questions = transformSignalsToInterviewQuestions(inputs, { maxResults: 3 });
    expect(questions).toHaveLength(3);
  });
});
