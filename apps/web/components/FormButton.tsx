import Link, { type LinkProps } from "next/link";
import { ButtonHTMLAttributes, ReactNode } from "react";

type FormButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type FormButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: FormButtonVariant;
  children: ReactNode;
};

const VARIANT_CLASSES: Record<FormButtonVariant, string> = {
  primary:
    "border-0 bg-[var(--accent-primary)] text-[var(--verdict-apply-text)] hover:bg-[var(--accent-primary-hover)]",
  secondary:
    "border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--border-strong)]",
  ghost:
    "border border-[var(--border-subtle)] bg-transparent text-[var(--text-secondary)] hover:border-[var(--border-strong)]",
  danger:
    "border border-[var(--status-danger)] bg-[var(--status-danger-bg)] text-[var(--status-danger)] hover:bg-[var(--status-danger)]",
};

const BASE_CLASSES =
  "inline-flex items-center justify-center rounded-[var(--button-radius)] px-4 py-2 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]";

export const SECONDARY_ACTION_BUTTON_CLASSES = `${BASE_CLASSES} ${VARIANT_CLASSES.secondary}`;

type SecondaryActionLinkProps = LinkProps & {
  className?: string;
  children: ReactNode;
};

export function SecondaryActionLink({
  className,
  children,
  ...rest
}: SecondaryActionLinkProps) {
  return (
    <Link
      className={[SECONDARY_ACTION_BUTTON_CLASSES, className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </Link>
  );
}

export function FormButton({
  variant = "primary",
  className,
  disabled,
  children,
  type,
  ...rest
}: FormButtonProps) {
  const intentClass = VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.primary;
  const disabledClass = disabled ? "cursor-not-allowed opacity-60" : "";

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
