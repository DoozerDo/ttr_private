import { HTMLAttributes, ReactNode } from "react";

type AlertIntent = "info" | "success" | "warning" | "error";

type AlertProps = {
  title?: string;
  children: ReactNode;
  intent?: AlertIntent;
} & HTMLAttributes<HTMLDivElement>;

const INTENT_LABELS: Record<AlertIntent, string> = {
  info: "Info",
  success: "Success",
  warning: "Warning",
  error: "Error",
};

const INTENT_STYLES: Record<
  AlertIntent,
  { borderColor: string; backgroundColor: string; textColor: string }
> = {
  info: {
    borderColor: "var(--border-subtle)",
    backgroundColor: "var(--bg-elevated)",
    textColor: "var(--text-primary)",
  },
  success: {
    borderColor: "var(--accent-progress)",
    backgroundColor: "var(--bg-elevated)",
    textColor: "var(--text-primary)",
  },
  warning: {
    borderColor: "var(--accent-primary)",
    backgroundColor: "var(--bg-elevated)",
    textColor: "var(--text-primary)",
  },
  error: {
    borderColor: "var(--status-danger)",
    backgroundColor: "var(--status-danger-bg)",
    textColor: "var(--text-primary)",
  },
};

export function Alert({ title, children, intent = "info", className, ...rest }: AlertProps) {
  const style = INTENT_STYLES[intent];

  return (
    <div
      role="status"
      className={`rounded-2xl border px-4 py-3 text-sm ${className ?? ""}`}
      style={{
        borderColor: style.borderColor,
        backgroundColor: style.backgroundColor,
        color: style.textColor,
      }}
      {...rest}
    >
      <div className="flex items-start gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-current">
          {INTENT_LABELS[intent]}
        </span>
        <div className="flex-1 space-y-1">
          {title ? <p className="text-base font-semibold text-current">{title}</p> : null}
          <div className="text-current">{children}</div>
        </div>
      </div>
    </div>
  );
}
