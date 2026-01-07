import { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  kicker?: string;
  description?: string;
  rightSlot?: ReactNode;
  className?: string;
};

export function PageHeader({ title, kicker, description, rightSlot, className }: PageHeaderProps) {
  return (
    <div className={`flex flex-col gap-4 ${className ?? ""}`}>
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1">
          {kicker ? (
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-400">{kicker}</p>
          ) : null}
          <h1 className="text-3xl font-bold tracking-tight text-slate-100">{title}</h1>
          {description ? <p className="text-sm text-slate-300">{description}</p> : null}
        </div>
        {rightSlot ? <div className="flex flex-wrap items-center gap-2">{rightSlot}</div> : null}
      </div>
    </div>
  );
}
