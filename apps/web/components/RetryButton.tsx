"use client";

import { useRouter } from "next/navigation";

import { FormButton } from "./FormButton";

type RetryButtonProps = {
  label?: string;
  className?: string;
  disabled?: boolean;
};

export function RetryButton({ label = "Retry", className, disabled }: RetryButtonProps) {
  const router = useRouter();

  return (
    <FormButton
      variant="secondary"
      onClick={() => router.refresh()}
      disabled={disabled}
      className={className}
    >
      {label}
    </FormButton>
  );
}
