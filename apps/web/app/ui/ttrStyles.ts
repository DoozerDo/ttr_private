import type { CSSProperties } from "react";

export const ttrColors = {
  textPrimary: "#f8fafc",
  textSecondary: "rgba(226,232,240,0.7)",
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

export const ttrBackgrounds = {
  page:
    "radial-gradient(circle at 20% 20%, rgba(251,191,36,0.08), transparent 30%), radial-gradient(circle at 80% 0%, rgba(248,113,113,0.08), transparent 30%), linear-gradient(180deg, #0f172a, #0b1220 60%, #0f172a)",
  header:
    "linear-gradient(120deg, rgba(255,255,255,0.02), rgba(251,191,36,0.05))",
  panel:
    "linear-gradient(135deg, rgba(15,23,42,0.85), rgba(30,41,59,0.75))",
  input: "rgba(0,0,0,0.25)",
};

export const ttrBorders = {
  soft: "1px solid rgba(255,255,255,0.06)",
  softStrong: "1px solid rgba(255,255,255,0.1)",
  input: "1px solid rgba(255,255,255,0.08)",
};

export const ttrTypography = {
  kicker: {
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "rgba(251,191,36,0.8)",
    fontWeight: 700,
  } satisfies CSSProperties,

  subtleLabel: {
    fontSize: 12,
    letterSpacing: 3,
    textTransform: "uppercase",
    color: "rgba(251,191,36,0.75)",
    fontWeight: 700,
  } satisfies CSSProperties,

  h1: {
    margin: 0,
    fontSize: 24,
    fontWeight: 700,
    color: "#f8fafc",
  } satisfies CSSProperties,

  h2: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    color: "#f8fafc",
  } satisfies CSSProperties,
};

export const ttrLayout = {
  page: {
    minHeight: "100vh",
    background: ttrBackgrounds.page,
    color: "#e2e8f0",
    padding: "48px 0 72px",
  } satisfies CSSProperties,

  container: {
    margin: "0 auto",
    maxWidth: 1180,
    padding: "0 20px",
    display: "flex",
    flexDirection: "column",
    gap: 20,
  } satisfies CSSProperties,

  headerBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "14px 16px",
    borderRadius: ttrRadii.shell,
    border: ttrBorders.soft,
    background: ttrBackgrounds.header,
    boxShadow: ttrShadows.header,
  } satisfies CSSProperties,

  headerLeft: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,

  panelsRow: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap",
  } satisfies CSSProperties,
};

export const ttrComponents = {
  basePanel: {
    position: "relative",
    border: ttrBorders.soft,
    borderRadius: ttrRadii.panel,
    padding: 20,
    background: ttrBackgrounds.panel,
    boxShadow: ttrShadows.panel,
    backdropFilter: "blur(10px)",
    minWidth: 300,
    flex: 1,
  } satisfies CSSProperties,

  fieldLabel: {
    color: "rgba(226,232,240,0.9)",
    fontWeight: 600,
    fontSize: 14,
  } satisfies CSSProperties,

  input: {
    width: "100%",
    marginTop: 8,
    background: ttrBackgrounds.input,
    color: "#f8fafc",
    borderRadius: ttrRadii.input,
    border: ttrBorders.input,
    padding: "10px 12px",
    fontSize: 14,
    outline: "none",
    transition: "border 160ms ease, box-shadow 160ms ease",
    boxShadow: ttrShadows.panelInset,
  } satisfies CSSProperties,

  chip: {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 9999,
    background: "rgba(251,191,36,0.08)",
    border: "1px solid rgba(251,191,36,0.35)",
    color: "rgba(255, 249, 230, 0.9)",
    fontSize: 13,
    marginRight: 8,
    marginBottom: 8,
  } satisfies CSSProperties,

  dangerBox: {
    border: ttrColors.dangerBorder,
    background: ttrColors.dangerBg,
    color: ttrColors.dangerText,
    padding: "10px 12px",
    borderRadius: ttrRadii.input,
    fontSize: 13,
  } satisfies CSSProperties,

  primaryButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
    border: "none",
    borderRadius: ttrRadii.button,
    padding: "14px 16px",
    background: "linear-gradient(120deg, #fbbf24, #f97316)",
    color: "#0f172a",
    fontWeight: 800,
    fontSize: 15,
    cursor: "pointer",
    boxShadow: ttrShadows.button,
    transition: "transform 160ms ease, box-shadow 160ms ease, filter 160ms ease",
  } satisfies CSSProperties,
};

