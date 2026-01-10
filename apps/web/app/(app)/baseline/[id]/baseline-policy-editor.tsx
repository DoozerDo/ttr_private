"use client";

import { useEffect, useMemo, useState } from "react";

import {
  BaselineBlockDto,
  BaselineIncludePolicy,
  BaselineVersionDto,
} from "@/lib/baselines";

type BaselinePolicyEditorProps = {
  baselineId: string;
  versions: BaselineVersionDto[];
  initialVersionId: string;
};

const includeTagOptions: Array<{ value: BaselineIncludePolicy; label: string }> = [
  { value: "always", label: "Always" },
  { value: "optional", label: "Optional" },
  { value: "never", label: "Never" },
];

export function BaselinePolicyEditor({
  baselineId,
  versions,
  initialVersionId,
}: BaselinePolicyEditorProps) {
  const [versionOptions, setVersionOptions] = useState<BaselineVersionDto[]>(versions);
  const [selectedVersionId, setSelectedVersionId] = useState(initialVersionId);
  const [versionHash, setVersionHash] = useState("");
  const [blocks, setBlocks] = useState<BaselineBlockDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const sortedVersions = useMemo(
    () =>
      [...versionOptions].sort(
        (a, b) => (b.versionNumber ?? 0) - (a.versionNumber ?? 0),
      ),
    [versionOptions],
  );

  useEffect(() => {
    if (selectedVersionId) {
      void loadBlocks(selectedVersionId);
    }
  }, [selectedVersionId]);

  async function loadBlocks(versionId: string) {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch(
        `/api/baselines/${baselineId}/blocks?baseline_version_id=${versionId}`,
        { cache: "no-store" },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error?.message || data?.error || "Unable to load blocks.",
        );
      }

      setBlocks((data?.blocks as BaselineBlockDto[]) ?? []);
      setVersionHash(data?.baseline_version_hash ?? "");
      setSelectedVersionId(data?.baseline_version_id ?? versionId);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load baseline blocks right now.",
      );
      setBlocks([]);
    } finally {
      setLoading(false);
    }
  }

  async function refreshVersions() {
    try {
      const response = await fetch(`/api/baselines/${baselineId}/versions`, {
        cache: "no-store",
      });

      if (!response.ok) return versionOptions;

      const payload = (await response.json()) as BaselineVersionDto[];
      setVersionOptions(payload);
      return payload;
    } catch {
      return versionOptions;
    }
  }

  function updateBlockPolicy(blockId: string, include_tag: BaselineIncludePolicy) {
    setBlocks((current) =>
      current.map((block) =>
        block.id === blockId
          ? {
              ...block,
              include_tag,
            }
          : block,
      ),
    );
    setSuccess(false);
    setError(null);
  }

  async function savePolicies() {
    if (!selectedVersionId) {
      setError("Select a baseline version before saving.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    const payload = {
      baseline_version_id: selectedVersionId,
      baseline_version_hash: versionHash,
      blocks: blocks.map((block) => ({
        id: block.id,
        include_tag: block.include_tag,
        order_index: block.order_index,
      })),
    };

    try {
      const response = await fetch(`/api/baselines/${baselineId}/blocks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409 && data?.error?.details) {
          const details = data.error.details;
          setError("This baseline was updated elsewhere. Reloaded the latest version.");
          if (details?.baseline_version_id) {
            setSelectedVersionId(details.baseline_version_id);
            setVersionHash(details.baseline_version_hash ?? "");
            await loadBlocks(details.baseline_version_id);
          }
          return;
        }

        throw new Error(
          data?.error?.message || data?.error || "Unable to save block policies.",
        );
      }

      const newVersionId = data?.new_version_id ?? selectedVersionId;
      setVersionHash(data?.hash ?? versionHash);
      setSelectedVersionId(newVersionId);
      await refreshVersions();
      await loadBlocks(newVersionId);
      setSuccess(true);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save block policies.",
      );
    } finally {
      setSaving(false);
    }
  }

  const selectedVersionLabel = useMemo(() => {
    const match = sortedVersions.find((v) => v.id === selectedVersionId);
    return match ? `v${match.versionNumber}` : "";
  }, [selectedVersionId, sortedVersions]);

  return (
    <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-gray-900">Block policies</h2>
          <p className="text-sm text-gray-700">
            Control whether each block should always be included, remain optional, or never be used
            for this baseline version.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-semibold text-gray-800" htmlFor="baselineVersionId">
            Version
          </label>
          <select
            id="baselineVersionId"
            name="baselineVersionId"
            value={selectedVersionId}
            onChange={(event) => setSelectedVersionId(event.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm"
            disabled={loading || saving || sortedVersions.length === 0}
          >
            {sortedVersions.length === 0 && <option value="">No versions available</option>}
            {sortedVersions.map((version) => (
              <option key={version.id} value={version.id}>
                Version {version.versionNumber}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={savePolicies}
            disabled={saving || loading || blocks.length === 0}
            className={`rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm ${
              saving || loading || blocks.length === 0
                ? "bg-gray-400"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {saving ? "Saving..." : "Save policies"}
          </button>
        </div>
      </div>

      {versionHash && (
        <p className="text-xs text-gray-600">
          Version hash {selectedVersionLabel ? `${selectedVersionLabel}: ` : ""}
          <span className="font-mono text-gray-800">{versionHash}</span>
        </p>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Block policies saved for {selectedVersionLabel || "this version"}.
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-700">Loading blocks...</p>
      ) : blocks.length === 0 ? (
        <p className="text-sm text-gray-700">No blocks available for this baseline.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {blocks
            .slice()
            .sort((a, b) => a.order_index - b.order_index)
            .map((block) => (
              <article
                key={block.id}
                className="flex h-full flex-col justify-between rounded-md border border-gray-100 bg-gray-50 p-4 shadow-sm"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-gray-200 px-2 py-1 text-xs font-semibold uppercase text-gray-800">
                      {block.section_type}
                    </span>
                    <div className="flex gap-2">
                      {includeTagOptions.map((option) => {
                        const isActive = block.include_tag === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => updateBlockPolicy(block.id, option.value)}
                            disabled={saving}
                            className={`rounded-full px-3 py-1 text-xs font-semibold shadow-sm transition ${
                              isActive
                                ? "bg-blue-600 text-white"
                                : "bg-white text-gray-800 hover:bg-gray-100"
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-gray-900">
                    {block.title || "Untitled block"}
                  </p>
                  <p className="line-clamp-4 whitespace-pre-wrap text-sm text-gray-800">
                    {block.content}
                  </p>
                </div>
                <p className="mt-3 text-xs text-gray-600">Order: {block.order_index}</p>
              </article>
            ))}
        </div>
      )}
    </section>
  );
}

