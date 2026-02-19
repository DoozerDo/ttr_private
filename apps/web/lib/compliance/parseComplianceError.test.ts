import assert from "node:assert";
import test from "node:test";

import { parseComplianceError } from "./parseComplianceError";

test("parses modern compliance payload with explicit violations", () => {
  const payload = {
    errorCode: "COMPLIANCE_VIOLATION",
    violations: [
      {
        code: "scope_inflation",
        message: "Scope expanded beyond baseline.",
        severity: "BLOCK",
      },
    ],
    auditId: "audit-123",
    baselineVersionHash: "hash-abc",
  };

  const result = parseComplianceError({ status: 422, payload });

  assert.strictEqual(result?.type, "COMPLIANCE_VIOLATION");
  assert.strictEqual(result?.auditId, "audit-123");
  assert.strictEqual(result?.baselineVersionHash, "hash-abc");
  assert.strictEqual(result?.violations.length, 1);
  assert.deepStrictEqual(result?.violations[0], {
    code: "scope_inflation",
    message: "Scope expanded beyond baseline.",
    severity: "block",
  });
});

test("detects legacy compliance_flags arrays without explicit code", () => {
  const payload = {
    message: "There are compliance issues.",
    details: {
      compliance_flags: [
        { code: "legacy_flag", message: "Legacy flag triggered." },
      ],
    },
  };

  const result = parseComplianceError({ status: 422, payload });

  assert.strictEqual(result?.violations[0].code, "legacy_flag");
  assert.strictEqual(result?.violations[0].message, "Legacy flag triggered.");
  assert.strictEqual(result?.violations[0].severity, null);
});

test("parses insufficient extracted text payload", () => {
  const payload = {
    errorCode: "insufficient_extracted_text",
    details: {
      minChars: 600,
      extractedChars: 42,
      preview: "Parsed text preview",
      reason: "likely_extraction_failure",
      tips: ["Step 1", "Step 2"],
    },
    auditId: "audit-xyz",
    baselineVersionHash: "hash-789",
  };

  const result = parseComplianceError({ status: 422, payload });

  assert.strictEqual(result?.type, "insufficient_extracted_text");
  if (result?.type !== "insufficient_extracted_text") {
    throw new Error("Unexpected compliance error type");
  }
  assert.strictEqual(result.details.minChars, 600);
  assert.strictEqual(result.details.extractedChars, 42);
  assert.strictEqual(result.details.preview, "Parsed text preview");
  assert.strictEqual(result.details.reason, "likely_extraction_failure");
  assert.deepStrictEqual(result.details.tips, ["Step 1", "Step 2"]);
  assert.strictEqual(result.auditId, "audit-xyz");
  assert.strictEqual(result.baselineVersionHash, "hash-789");
});
