import type { ParsedComplianceError } from "@/lib/compliance/parseComplianceError";
import { ttrComponents, ttrTypography } from "@/app/ui/ttrStyles";

type ComplianceViolationPanelProps = {
  error: ParsedComplianceError;
};

export function ComplianceViolationPanel({ error }: ComplianceViolationPanelProps) {
  return (
    <div
      style={{
        ...ttrComponents.dangerBox,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 15 }}>Compliance check failed</div>
      <div
        style={{
          ...ttrTypography.paragraph,
          fontSize: 13,
          margin: 0,
        }}
      >
        The system blocked output because it detected unverified content.
      </div>

      <ul
        style={{
          margin: 0,
          paddingLeft: 18,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          color: "rgba(241,245,249,0.92)",
          fontSize: 13,
        }}
      >
        {error.violations.map((violation, index) => (
          <li key={`${violation.code ?? violation.message}-${index}`}>
            {violation.code ? `${violation.code}: ` : ""}
            {violation.message}
          </li>
        ))}
      </ul>

      {error.auditId ? (
        <div style={{ fontSize: 12, color: "rgba(226,232,240,0.7)" }}>Audit ID: {error.auditId}</div>
      ) : null}
      {error.baselineVersionHash ? (
        <div style={{ fontSize: 12, color: "rgba(226,232,240,0.7)" }}>
          Baseline hash: {error.baselineVersionHash}
        </div>
      ) : null}
    </div>
  );
}
