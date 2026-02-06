"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Alert } from "@/components/Alert";
import {
  BaselineBlockDto,
  getBaselineBlocks,
  updateBaselineBlockPolicies,
  UpdateBaselineBlocksRequest,
} from "@/lib/baselines";
import { BaselineBlockPolicyList } from "@/components/BaselineBlockPolicyList";

type BaselineBlockPolicyPanelProps = {
  baselineId: string;
  baselineVersionId: string;
  baselineVersionHash: string | null;
  baselineVersionLabel?: string;
  refreshSignal?: number;
  onVersionAdvance?: (newVersionId: string, newHash: string | null) => void;
  onPoliciesSaved?: () => void;
};

export function BaselineBlockPolicyPanel({
  baselineId,
  baselineVersionId,
  baselineVersionHash,
  baselineVersionLabel,
  refreshSignal,
  onVersionAdvance,
  onPoliciesSaved,
}: BaselineBlockPolicyPanelProps) {
  const [blocks, setBlocks] = useState<BaselineBlockDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [localVersionHash, setLocalVersionHash] = useState<string | null>(
    baselineVersionHash ?? null,
  );

  useEffect(() => {
    setLocalVersionHash(baselineVersionHash ?? null);
  }, [baselineVersionHash]);

  useEffect(() => {
    if (!baselineId || !baselineVersionId) {
      setBlocks([]);
      setError(null);
      setLoading(false);
      return;
    }

    let canceled = false;
    setLoading(true);
    setError(null);
    const fetchBlocks = async () => {
      try {
        const payload = await getBaselineBlocks(baselineId, baselineVersionId);
        if (canceled) return;
        setBlocks(payload.blocks);
        setLocalVersionHash(payload.baseline_version_hash ?? null);
      } catch (fetchError) {
        if (canceled) return;
        const message =
          fetchError instanceof Error
            ? fetchError.message
            : "Unable to load baseline blocks.";
        setError(message);
        setBlocks([]);
      } finally {
        if (!canceled) {
          setLoading(false);
        }
      }
    };

    void fetchBlocks();

    return () => {
      canceled = true;
    };
  }, [baselineId, baselineVersionId, refreshSignal]);

  const handlePolicyChange = useCallback(
    (blockId: string, includePolicy: BaselineBlockDto["include_tag"]) => {
      setBlocks((current) =>
        current.map((block) =>
          block.id === blockId ? { ...block, include_tag: includePolicy } : block,
        ),
      );
      setError(null);
      setSuccessMessage(null);
    },
    [],
  );

  const canSave =
    Boolean(baselineId) && Boolean(baselineVersionId) && blocks.length > 0 && !loading;

  const handleSave = useCallback(async () => {
    if (!baselineId || !baselineVersionId || !canSave) return;
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    const payload: UpdateBaselineBlocksRequest = {
      baseline_version_id: baselineVersionId,
      baseline_version_hash: localVersionHash,
      blocks: blocks.map((block) => ({
        id: block.id,
        include_tag: block.include_tag,
        order_index: block.order_index,
      })),
    };

    try {
      const result = await updateBaselineBlockPolicies(baselineId, payload);
      setSuccessMessage("Block policies saved.");
      setLocalVersionHash(result.hash ?? null);
      setBlocks(result.updated_blocks);
      if (result.new_version_id) {
        onVersionAdvance?.(result.new_version_id, result.hash ?? null);
      }
      onPoliciesSaved?.();
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : "Unable to save block policies.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }, [
    baselineId,
    baselineVersionId,
    blocks,
    canSave,
    localVersionHash,
    onPoliciesSaved,
    onVersionAdvance,
  ]);

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Blocks</h2>
          <p className="text-xs text-slate-300">
            Manage how each block is treated during resume and cover generation.
          </p>
          {localVersionHash ? (
            <p className="mt-2 text-[11px] text-slate-400">
              Version hash{" "}
              {baselineVersionLabel ? `${baselineVersionLabel}: ` : ""}
              <span className="font-mono text-slate-200">{localVersionHash}</span>
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave || saving}
          className={`rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition ${
            !canSave || saving ? "bg-slate-500" : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {saving ? "Saving..." : "Save policies"}
        </button>
      </div>

      {error ? (
        <Alert intent="error" title="Unable to load blocks">
          <p className="text-xs">{error}</p>
        </Alert>
      ) : null}

      {successMessage ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          {successMessage}
        </div>
      ) : null}

      {loading && blocks.length === 0 ? (
        <p className="text-sm text-slate-400">Loading blocks...</p>
      ) : (
        <BaselineBlockPolicyList
          blocks={blocks}
          onPolicyChange={handlePolicyChange}
          saving={saving}
        />
      )}
    </section>
  );
}
