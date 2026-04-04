import type { CSSProperties } from "react";
import type {
  ParsedComplianceViolationError,
} from "@/lib/compliance/parseComplianceError";
import { ttrComponents, ttrTypography } from "@/app/(app)/ui/ttrStyles";

export type ComplianceFlag = {
  code?: string | null;
  message: string;
  severity?: string | null;
};

export type ComplianceFlagPanelProps = {
  title: string;
  description: string;
  flags: ComplianceFlag[];
  auditId?: string;
  baselineVersionHash?: string | null;
  intent?: "error" | "warning";
  showMeta?: boolean;
};

const INTENT_STYLES: Record<
  NonNullable<ComplianceFlagPanelProps["intent"]>,
  CSSProperties
> = {
  error: ttrComponents.dangerBox,
  warning: ttrComponents.warningBox,
};

export function ComplianceFlagPanel({
  title,
  description,
  flags,
  auditId,
  baselineVersionHash,
  intent = "error",
  showMeta = false,
}: ComplianceFlagPanelProps) {
  if (!flags.length) {
    return null;
  }

  const style = INTENT_STYLES[intent] ?? INTENT_STYLES.error;

  return (
    <div
      style={{
        ...style,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>

      <div
        style={{
          ...(ttrTypography.paragraph as CSSProperties),
          fontSize: 13,
          margin: 0,
        }}
      >
        {description}
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
        {flags.map((flag, index) => (
          <li key={`${flag.code ?? flag.message}-${index}`}>
            {flag.code ? `${flag.code}: ` : ""}
            {flag.message}
          </li>
        ))}
      </ul>

      {showMeta && auditId ? (
        <div style={{ fontSize: 12, color: "rgba(226,232,240,0.7)" }}>
          Audit ID: {auditId}
        </div>
      ) : null}

      {showMeta && baselineVersionHash ? (
        <div style={{ fontSize: 12, color: "rgba(226,232,240,0.7)" }}>
          Baseline hash: {baselineVersionHash}
        </div>
      ) : null}
    </div>
  );
}

type ComplianceViolationPanelProps = {
  error: ParsedComplianceViolationError;
};

export function ComplianceViolationPanel({ error }: ComplianceViolationPanelProps) {
  const violations = error.violations ?? [];
  if (!violations.length) {
    return null;
  }

  const blockFlags = violations.filter(
    (flag) => (flag.severity ?? "").toLowerCase() === "block",
  );
  const notedFlags = violations.filter(
    (flag) => (flag.severity ?? "").toLowerCase() !== "block",
  );

  const containerStyle = {
    ...ttrComponents.warningBox,
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  };

  return (
    <div style={containerStyle}>
      <div style={{ fontWeight: 700, fontSize: 16 }}>Verification needed</div>

      <div
        style={{
          ...(ttrTypography.paragraph as CSSProperties),
          fontSize: 13,
          margin: 0,
        }}
      >
        The system paused to protect accuracy and avoid accidental misrepresentation.
      </div>

      {blockFlags.length ? (
        <ComplianceFlagPanel
          title="Needs verification"
          description="Review these items before continuing."
          flags={blockFlags}
          intent="warning"
          auditId={blockFlags.length ? error.auditId : undefined}
          baselineVersionHash={blockFlags.length ? error.baselineVersionHash : null}
          showMeta={false}
        />
      ) : null}

      {notedFlags.length ? (
        <ComplianceFlagPanel
          title="Noted"
          description="We documented these observations for your awareness."
          flags={notedFlags}
          intent="warning"
          showMeta={false}
        />
      ) : null}
    </div>
  );
}
