import { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  body: string | ReactNode;
  cta?: ReactNode;
  className?: string;
};

export function EmptyState({ title, body, cta, className }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/20 bg-white/5 px-6 py-8 text-center text-sm text-slate-300 ${className ?? ""}`}
    >
      <p className="text-lg font-semibold text-slate-100">{title}</p>
      <p className="max-w-md text-slate-300">{body}</p>
      {cta ? <div className="flex flex-wrap justify-center gap-2">{cta}</div> : null}
    </div>
  );
}
