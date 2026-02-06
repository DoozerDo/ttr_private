"use client";

import { useMemo } from "react";

import {
  BaselineBlockDto,
  BaselineIncludePolicy,
  BaselineSectionType,
} from "@/lib/baselines";

const policyOptions: Array<{
  value: BaselineIncludePolicy;
  label: string;
  description: string;
}> = [
  {
    value: "always",
    label: "Always",
    description: "Force this block into every generated draft.",
  },
  {
    value: "optional",
    label: "Optional",
    description: "Allow the writer to include this block when relevant.",
  },
  {
    value: "never",
    label: "Never",
    description: "Exclude the block from downstream generations.",
  },
];

const sectionTitles: Record<string, string> = {
  RAW: "Raw",
  SUMMARY: "Summary",
  EXPERIENCE: "Experience",
  PROJECT: "Projects / Programs",
  SKILLS: "Skills",
  EDUCATION: "Education",
  OTHER: "Other",
};

type BaselineBlockPolicyListProps = {
  blocks: BaselineBlockDto[];
  onPolicyChange: (blockId: string, includePolicy: BaselineIncludePolicy) => void;
  saving?: boolean;
};

const truncatePreview = (value: string, max = 220) => {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max).trimEnd()}…`;
};

export function BaselineBlockPolicyList({
  blocks,
  onPolicyChange,
  saving,
}: BaselineBlockPolicyListProps) {
  const sortedBlocks = useMemo(
    () =>
      [...blocks].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)),
    [blocks],
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Content controls</p>
        <p className="text-xs text-slate-300">
          Use the three-state toggle to keep a block in every draft, allow it when relevant, or
          exclude it entirely.
        </p>
        <div className="grid gap-2 text-[11px] text-slate-400 sm:grid-cols-3">
          {policyOptions.map((option) => (
            <div key={option.value}>
              <p className="font-semibold text-slate-200">{option.label}</p>
              <p>{option.description}</p>
            </div>
          ))}
        </div>
      </div>

      {sortedBlocks.length === 0 ? (
        <p className="text-sm text-slate-400">No blocks are available for this baseline version.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {sortedBlocks.map((block) => {
            const sectionName =
              sectionTitles[block.section_type] ?? block.section_type ?? "Block";

            return (
              <article
                key={block.id}
                className="flex h-full flex-col justify-between rounded-2xl border border-white/10 bg-slate-950/30 p-4 text-sm text-slate-200"
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em]">
                      {sectionName}
                    </span>
                    <div className="flex gap-2">
                      {policyOptions.map((option) => {
                        const isActive = block.include_tag === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => onPolicyChange(block.id, option.value)}
                            disabled={saving}
                            className={`rounded-full px-3 py-1 text-xs font-semibold shadow-sm transition ${
                              isActive
                                ? "bg-blue-500 text-white"
                                : "bg-white text-slate-900 hover:bg-slate-100"
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-white">
                      {block.title || "Untitled block"}
                    </p>
                    <p className="text-xs text-slate-300">
                      {truncatePreview(block.content)}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-slate-500">
                  Order: {block.order_index ?? "—"}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
