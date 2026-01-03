// apps/web/app/ui/ttrStyles.ts
import type { CSSProperties } from "react";

export const ttrColors = {
  textPrimary: "#f8fafc",
  textSecondary: "rgba(226,232,240,0.75)",
  textMuted: "rgba(226,232,240,0.65)",
  labelAmber: "rgba(251,191,36,0.75)",
  labelAmberStrong: "rgba(251,191,36,0.8)",
  panelTextAmber: "rgba(251,191,36,0.9)",
  ringScore: "#fde68a",
  dangerText: "#fecdd3",
  dangerBorder: "rgba(248,113,113,0.5)",
  dangerBg: "rgba(248,113,113,0.12)",
};

export const ttrRadii = {
  shell: 14,
  panel: 18,
  input: 10,
  button: 12,
  pill: 999,
};

export const ttrShadows = {
  header: "0 10px 35px rgba(0,0,0,0.3)",
  panel: "0 15px 45px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)",
  panelInset: "inset 0 1px 0 rgba(255,255,255,0.03)",
  button: "0 15px 25px rgba(249,115,22,0.25)",
};

export const ttrLayout: Record<string, CSSProperties> = {
  shell: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at 20% 20%, rgba(251,191,36,0.08), transparent 30%), radial-gradient(circle at 80% 0%, rgba(248,113,113,0.08), transparent 30%), linear-gradient(180deg, #0f172a, #0b1220 60%, #0f172a)",
    color: ttrColors.textSecondary,
    padding: "40px 0 64px",
  },
  container: {
    margin: "0 auto",
    maxWidth: 1020,
    padding: "0 20px",
    display: "flex",
    flexDirection: "column",
    gap: 18,
  },
  panelsRow: {
    display: "flex",
    gap: 18,
    flexWrap: "wrap",
    alignItems: "stretch",
  },
};

export const ttrTypography: Record<string, CSSProperties> = {
  kicker: {
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: ttrColors.labelAmberStrong,
    fontWeight: 800,
  },
  h1: {
    margin: 0,
    fontSize: 26,
    fontWeight: 900,
    color: ttrColors.textPrimary,
  },
  h2: {
    margin: 0,
    fontSize: 18,
    fontWeight: 900,
    color: ttrColors.textPrimary,
  },
  paragraph: {
    margin: 0,
    fontSize: 13,
    color: ttrColors.textSecondary,
    lineHeight: 1.65,
  },
  subtleLabel: {
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: ttrColors.labelAmberStrong,
    fontWeight: 800,
  },
};

export const ttrComponents: Record<string, CSSProperties> = {
  headerCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "14px 16px",
    borderRadius: ttrRadii.shell,
    border: "1px solid rgba(255,255,255,0.06)",
    background:
      "linear-gradient(120deg, rgba(255,255,255,0.02), rgba(251,191,36,0.05))",
    boxShadow: ttrShadows.header,
  },

  basePanel: {
    position: "relative",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: ttrRadii.panel,
    padding: 20,
    background:
      "linear-gradient(135deg, rgba(15,23,42,0.85), rgba(30,41,59,0.75))",
    boxShadow: ttrShadows.panel,
    backdropFilter: "blur(10px)",
    overflow: "visible",
    flex: "1 1 420px",
    minWidth: 320,
  },

  fieldLabel: {
    display: "block",
    marginBottom: 8,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "rgba(226,232,240,0.8)",
    fontWeight: 800,
  },

  input: {
    width: "100%",
    borderRadius: ttrRadii.input,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.25)",
    color: ttrColors.textPrimary,
    padding: "10px 12px",
    outline: "none",
    boxShadow: ttrShadows.panelInset,
  },
  textInput: {
    width: "100%",
    borderRadius: ttrRadii.input,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.25)",
    color: ttrColors.textPrimary,
    padding: "10px 12px",
    outline: "none",
    boxShadow: ttrShadows.panelInset,
    fontSize: 13,
  },
  textArea: {
    width: "100%",
    borderRadius: ttrRadii.input,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.25)",
    color: ttrColors.textPrimary,
    padding: "10px 12px",
    outline: "none",
    boxShadow: ttrShadows.panelInset,
    fontSize: 13,
    resize: "vertical",
  },

  chip: {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    margin: "0 8px 8px 0",
    borderRadius: ttrRadii.pill,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(241,245,249,0.92)",
    fontSize: 12,
    fontWeight: 700,
  },

  dangerBox: {
    borderRadius: 12,
    border: `1px solid ${ttrColors.dangerBorder}`,
    background: ttrColors.dangerBg,
    color: ttrColors.dangerText,
    padding: "10px 12px",
    fontSize: 13,
  },
  successBox: {
    borderRadius: 12,
    border: "1px solid rgba(74,222,128,0.35)",
    background: "rgba(34,197,94,0.12)",
    color: "rgba(187,247,208,0.95)",
    padding: "10px 12px",
    fontSize: 13,
  },
  warningBox: {
    borderRadius: 12,
    border: "1px solid rgba(251,191,36,0.35)",
    background: "rgba(251,191,36,0.1)",
    color: "rgba(253,224,71,0.95)",
    padding: "10px 12px",
    fontSize: 13,
  },

  primaryButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "10px 12px",
    borderRadius: ttrRadii.button,
    fontSize: 13,
    fontWeight: 900,
    border: "none",
    background: "linear-gradient(120deg, #fbbf24, #f97316)",
    color: "#0f172a",
    boxShadow: ttrShadows.button,
    transition: "transform 160ms ease, box-shadow 160ms ease, opacity 160ms ease",
    userSelect: "none",
    whiteSpace: "nowrap",
  },
  secondaryButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "10px 12px",
    borderRadius: ttrRadii.button,
    fontSize: 13,
    fontWeight: 800,
    textDecoration: "none",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    color: "rgba(241,245,249,0.92)",
    boxShadow: "0 12px 22px rgba(0,0,0,0.25)",
    transition: "transform 160ms ease, box-shadow 160ms ease",
    userSelect: "none",
    whiteSpace: "nowrap",
  },

  quietButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "10px 12px",
    borderRadius: ttrRadii.button,
    fontSize: 13,
    fontWeight: 800,
    textDecoration: "none",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    color: "rgba(241,245,249,0.92)",
    boxShadow: "0 12px 22px rgba(0,0,0,0.25)",
    transition: "transform 160ms ease, box-shadow 160ms ease",
    userSelect: "none",
    whiteSpace: "nowrap",
  },
};

