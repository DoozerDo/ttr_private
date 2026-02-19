import { InputHTMLAttributes } from "react";

type TextInputProps = InputHTMLAttributes<HTMLInputElement>;

const BASE_CLASSES = [
  "w-full",
  "rounded-[var(--button-radius)]",
  "border",
  "border-[var(--border-subtle)]",
  "bg-[var(--bg-surface)]",
  "px-4",
  "py-2",
  "text-sm",
  "text-[var(--text-primary)]",
  "transition",
  "focus:border-[var(--accent-primary)]",
  "focus-visible:outline-none",
  "focus-visible:shadow-[var(--focus-ring)]",
].join(" ");

export function TextInput({ className, disabled, type = "text", ...rest }: TextInputProps) {
  const disabledClass = disabled ? "cursor-not-allowed opacity-60" : "";

  return (
    <input
      type={type}
      className={`${BASE_CLASSES} ${disabledClass} ${className ?? ""}`}
      disabled={disabled}
      {...rest}
    />
  );
}
