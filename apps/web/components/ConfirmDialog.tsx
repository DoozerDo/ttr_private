'use client';

import { ReactNode } from "react";

import { FormButton } from "@/components/FormButton";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  busy = false,
}: ConfirmDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6 text-slate-50 shadow-2xl shadow-black/80"
      >
        <h2 id="confirm-dialog-title" className="text-xl font-semibold text-slate-100">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 text-sm text-slate-300">{description}</p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <FormButton variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel ?? "Cancel"}
          </FormButton>
          <FormButton onClick={onConfirm} disabled={busy}>
            {busy ? "Saving..." : confirmLabel ?? "Confirm"}
          </FormButton>
        </div>
      </div>
    </div>
  );
}
