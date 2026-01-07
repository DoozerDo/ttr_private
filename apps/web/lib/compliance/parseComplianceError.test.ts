import assert from "node:assert";
import test from "node:test";

import { parseComplianceError } from "./parseComplianceError";

test("parses modern compliance payload with explicit violations", () => {
  const payload = {
    errorCode: "COMPLIANCE_VIOLATION",
    violations: [
      { code: "scope_inflation", message: "Scope expanded beyond baseline." },
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
});
