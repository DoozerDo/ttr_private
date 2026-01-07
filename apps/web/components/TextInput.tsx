import { InputHTMLAttributes } from "react";

type TextInputProps = InputHTMLAttributes<HTMLInputElement>;

const BASE_CLASSES =
  "w-full rounded-2xl border border-white/20 bg-white/5 px-4 py-2 text-sm text-slate-100 transition focus:border-amber-400 focus:bg-white/10 focus:outline-none";

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
