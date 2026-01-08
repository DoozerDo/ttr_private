import { HTMLAttributes, ReactNode } from "react";

type AlertIntent = "info" | "success" | "warning" | "error";

type AlertProps = {
  title?: string;
  children: ReactNode;
  intent?: AlertIntent;
} & HTMLAttributes<HTMLDivElement>;

const INTENT_CLASSES: Record<AlertIntent, string> = {
  info: "border border-slate-600 bg-slate-900 text-slate-100",
  success: "border border-emerald-500/70 bg-emerald-500/10 text-emerald-100",
  warning: "border border-amber-500/70 bg-amber-500/10 text-amber-100",
  error: "border border-rose-500/70 bg-rose-500/10 text-rose-100",
};

const INTENT_LABELS: Record<AlertIntent, string> = {
  info: "Info",
  success: "Success",
  warning: "Warning",
  error: "Error",
};

export function Alert({ title, children, intent = "info", className, ...rest }: AlertProps) {
  return (
    <div
      role="status"
      className={`rounded-2xl px-4 py-3 text-sm ${INTENT_CLASSES[intent]} ${className ?? ""}`}
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
