import { ButtonHTMLAttributes, ReactNode } from "react";

type FormButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type FormButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: FormButtonVariant;
  children: ReactNode;
};

const VARIANT_CLASSES: Record<FormButtonVariant, string> = {
  primary: "border-0 bg-gradient-to-r from-amber-400 to-orange-500 text-slate-900 shadow-lg shadow-amber-500/40",
  secondary: "border border-white/20 bg-white/5 text-slate-100 shadow",
  ghost: "border border-white/10 bg-transparent text-slate-100",
  danger: "border border-rose-500 bg-rose-500/10 text-rose-100",
};

const BASE_CLASSES =
  "inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold transition-colors duration-150";

export function FormButton({ variant = "primary", className, disabled, children, type, ...rest }: FormButtonProps) {
  const intentClass = VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.primary;
  const disabledClass = disabled ? "cursor-not-allowed opacity-60" : "hover:opacity-90";

  return (
    <button
      type={type ?? "button"}
      className={`${BASE_CLASSES} ${intentClass} ${disabledClass} ${className ?? ""}`}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}
