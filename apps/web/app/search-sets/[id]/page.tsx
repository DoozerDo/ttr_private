"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { InstrumentShell } from "../../ui/InstrumentShell";
import { ttrComponents, ttrLayout, ttrTypography } from "../../ui/ttrStyles";
import type { BaselineDto } from "../../../lib/baselines";
import {
  getSearchSet,
  runSearchSet,
  type SearchSetApiError,
  type SearchSetDto,
  type SearchSetRunResult,
} from "../../../lib/searchSetsClient";
import { TierGateNotice } from "@/components/TierGateNotice";
import { type TierGateError } from "@/lib/tiers";

const RESULT_LIMIT = 10;
const KNOWN_RESULT_KEYS = new Set([
  "jobId",
  "title",
  "company",
  "applyUrl",
  "sourceUrl",
  "fitScore",
  "verdict",
  "dimensionScores",
]);

type BaselineVersionOption = {
  label: string;
  value: string;
  baselineId: string;
};

function formatList(items: string[]): string {
  return items.map((item) => item.replace(/_/g, " ").toLowerCase()).join(", ");
}

function formatDate(value?: string | null): string {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString();
}

function normalizeExplanationValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean") return `${value}`;
  if (Array.isArray(value) && value.length) {
    return value
      .map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry)))
      .join(", ");
  }
  return null;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div
      style={{
        borderRadius: 12,
        border: "1px dashed rgba(148,163,184,0.4)",
        padding: 18,
        textAlign: "center",
        background: "rgba(30,41,59,0.3)",
      }}
    >
      <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{title}</p>
      <p style={{ margin: "8px 0 0", color: "rgba(226,232,240,0.7)", fontSize: 13 }}>{description}</p>
    </div>
  );
}

export default function SearchSetRunPage() {
  const params = useParams<{ id: string }>();
  const searchSetId = params?.id;
  const [searchSet, setSearchSet] = useState<SearchSetDto | null>(null);
  const [searchSetLoading, setSearchSetLoading] = useState(true);
  const [searchSetError, setSearchSetError] = useState<string | null>(null);

  const [baselines, setBaselines] = useState<BaselineDto[]>([]);
  const [baselinesLoading, setBaselinesLoading] = useState(true);
  const [baselinesError, setBaselinesError] = useState<string | null>(null);

  const [selectedBaselineVersionId, setSelectedBaselineVersionId] = useState("");
  const [running, setRunning] = useState(false);
  const [runResults, setRunResults] = useState<SearchSetRunResult[]>([]);
  const [runExecuted, setRunExecuted] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [tierGateError, setTierGateError] = useState<TierGateError | null>(null);
  const [runMessage, setRunMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!searchSetId) return;
    setSearchSetLoading(true);
    setSearchSetError(null);

    getSearchSet(searchSetId)
      .then((data) => setSearchSet(data))
      .catch((error: Error) => {
        setSearchSetError(error.message || "Unable to load this search set.");
      })
      .finally(() => setSearchSetLoading(false));
  }, [searchSetId]);

  useEffect(() => {
    setBaselinesLoading(true);
    setBaselinesError(null);

    fetch("/api/baselines", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          const text = await response.text().catch(() => "Unable to load baselines.");
          throw new Error(text);
        }
        return response.json() as Promise<BaselineDto[]>;
      })
      .then((data) => setBaselines(data))
      .catch((error: Error) => setBaselinesError(error.message))
      .finally(() => setBaselinesLoading(false));
  }, []);

  const baselineOptions = useMemo<BaselineVersionOption[]>(() => {
    return baselines.flatMap((baseline) =>
      (baseline.versions ?? []).map((version) => ({
        value: version.id,
        baselineId: baseline.id,
        label: `${baseline.originalFilename ?? baseline.id} · v${version.versionNumber ?? "?"}`,
      })),
    );
  }, [baselines]);

  useEffect(() => {
    if (!selectedBaselineVersionId) return;
    if (!baselineOptions.some((option) => option.value === selectedBaselineVersionId)) {
      setSelectedBaselineVersionId("");
    }
  }, [baselineOptions, selectedBaselineVersionId]);

  const selectedBaselineLabel = useMemo(
    () => baselineOptions.find((option) => option.value === selectedBaselineVersionId)?.label ?? null,
    [baselineOptions, selectedBaselineVersionId],
  );

  const handleRun = useCallback(async () => {
    if (!searchSetId || !selectedBaselineVersionId) return;

    setRunning(true);
    setRunError(null);
    setValidationErrors([]);
    setTierGateError(null);
    setRunMessage(null);

    try {
      const results = await runSearchSet(searchSetId, selectedBaselineVersionId, RESULT_LIMIT);
      setRunResults(results);
      setRunExecuted(true);
      if (results.length) {
        setRunMessage(`Found ${results.length} matching roles.`);
      }
    } catch (error) {
      const apiError = error as SearchSetApiError;
      if (apiError.validationErrors?.length) {
        setValidationErrors(apiError.validationErrors);
      }
      if (apiError.tierGate) {
        setTierGateError(apiError.tierGate);
      }
      setRunError(apiError.message ?? "Unable to run this search set.");
    } finally {
      setRunning(false);
    }
  }, [searchSetId, selectedBaselineVersionId]);

  const explanationEntries = useMemo(
    () =>
      runResults.map((result) =>
        Object.entries(result)
          .filter(
            ([key, value]) =>
              !KNOWN_RESULT_KEYS.has(key) &&
              normalizeExplanationValue(value) !== null,
          )
          .map(([key, value]) => ({
            key,
            label: key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim(),
            value: normalizeExplanationValue(value) as string,
          })),
      ),
    [runResults],
  );

  const searchSetSummary = useMemo(() => {
    if (!searchSet) return null;
    return (
      <>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <span style={ttrComponents.chip}>
            {searchSet.isActive ? "Active" : "Inactive"} search set
          </span>
          <span style={{ ...ttrComponents.chip, background: "rgba(226,232,240,0.1)" }}>
            {searchSet.urlBacked ? "Job board URL" : "Manual filters"}
          </span>
        </div>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Title filters:</span>
            <span style={{ color: "rgba(226,232,240,0.8)" }}>
              {searchSet.titlePatterns.length ? formatList(searchSet.titlePatterns) : "Any"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Seniority:</span>
            <span style={{ color: "rgba(226,232,240,0.8)" }}>
              {searchSet.seniority.length ? formatList(searchSet.seniority) : "Any"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Work mode:</span>
            <span style={{ color: "rgba(226,232,240,0.8)" }}>
              {searchSet.workMode.length ? formatList(searchSet.workMode) : "Any"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Industries:</span>
            <span style={{ color: "rgba(226,232,240,0.8)" }}>
              {searchSet.industry.length ? formatList(searchSet.industry) : "Any"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Location:</span>
            <span style={{ color: "rgba(226,232,240,0.8)" }}>
              {searchSet.location ? searchSet.location : "Any"}
            </span>
          </div>
        </div>
      </>
    );
  }, [searchSet]);

  return (
    <InstrumentShell
      kicker="Search sets"
      title="Run search set"
      subtitle="Apply a baseline to the saved filter and surface the best-fit roles."
    >
      <div style={ttrLayout.panelsRow}>
        <section style={{ ...ttrComponents.basePanel, flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <span style={ttrTypography.subtleLabel}>Search set</span>
            <h2 style={ttrTypography.h2}>Overview</h2>
            {searchSetLoading ? (
              <p style={{ color: "rgba(226,232,240,0.6)" }}>Loading search set details…</p>
            ) : searchSetError ? (
              <div style={ttrComponents.dangerBox}>{searchSetError}</div>
            ) : (
              <>
                {searchSet?.sourceUrl ? (
                  <a
                    href={searchSet.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#93c5fd", textDecoration: "underline", fontSize: 14 }}
                  >
                    {searchSet.sourceUrl}
                  </a>
                ) : null}
                {searchSetSummary}
                <div style={{ fontSize: 12, color: "rgba(226,232,240,0.65)", marginTop: 10 }}>
                  Created: {formatDate(searchSet?.createdAt)}
                  <br />
                  Updated: {formatDate(searchSet?.updatedAt)}
                </div>
                {searchSet?.parseWarning ? (
                  <div style={{ ...ttrComponents.warningBox, marginTop: 12 }}>
                    {searchSet.parseWarning}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </section>

        <section style={{ ...ttrComponents.basePanel, flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <span style={ttrTypography.subtleLabel}>Baseline version</span>
            <h2 style={ttrTypography.h2}>Selection</h2>
          </div>
          {baselinesLoading ? (
            <p style={{ color: "rgba(226,232,240,0.6)" }}>Picking baseline versions…</p>
          ) : baselinesError ? (
            <div style={ttrComponents.dangerBox}>{baselinesError}</div>
          ) : !baselineOptions.length ? (
            <div>
              <div style={ttrComponents.warningBox}>
                Upload a baseline to run search sets.{" "}
                <Link href="/baseline" style={{ color: "#93c5fd", textDecoration: "underline" }}>
                  Open baseline library
                </Link>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <select
                value={selectedBaselineVersionId}
                onChange={(event) => setSelectedBaselineVersionId(event.target.value)}
                style={{
                  ...ttrComponents.input,
                  background: "rgba(15,23,42,0.6)",
                  borderColor: "rgba(148,163,184,0.4)",
                  color: "#e2e8f0",
                }}
              >
                <option value="" disabled>
                  Select a baseline version
                </option>
                {baselines.map((baseline) => (
                  <optgroup key={baseline.id} label={baseline.originalFilename ?? baseline.id}>
                    {(baseline.versions ?? []).map((version) => (
                      <option key={version.id} value={version.id}>
                        {`v${version.versionNumber ?? "?"} · ${baseline.originalFilename ?? baseline.id}`}
                        {version.fileHash ? ` (${version.fileHash.slice(0, 8)})` : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {selectedBaselineLabel ? (
                <div style={{ fontSize: 13, color: "rgba(226,232,240,0.7)" }}>
                  Selected: {selectedBaselineLabel}
                </div>
              ) : null}
              <button
                type="button"
                onClick={handleRun}
                disabled={running || !selectedBaselineVersionId || searchSetLoading || baselinesLoading}
                style={{
                  ...ttrComponents.primaryButton,
                  opacity: running || !selectedBaselineVersionId ? 0.6 : 1,
                  cursor: running || !selectedBaselineVersionId ? "not-allowed" : "pointer",
                }}
              >
                {running ? "Running…" : "Run search set"}
              </button>
              {tierGateError ? <TierGateNotice error={tierGateError} /> : null}
              {runError ? <div style={ttrComponents.dangerBox}>{runError}</div> : null}
              {validationErrors.length ? (
                <div style={ttrComponents.dangerBox}>
                  <strong style={{ display: "block", marginBottom: 6 }}>Validation issues</strong>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {validationErrors.map((entry, index) => (
                      <li key={index} style={{ fontSize: 13 }}>
                        {entry}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {runMessage ? <div style={ttrComponents.successBox}>{runMessage}</div> : null}
            </div>
          )}
        </section>
      </div>

      <section style={{ ...ttrComponents.basePanel, marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={ttrTypography.subtleLabel}>Results</span>
            <h2 style={ttrTypography.h2}>Matched roles</h2>
          </div>
          <div style={{ fontSize: 12, color: "rgba(226,232,240,0.7)" }}>
            {runResults.length ? `${runResults.length} / ${RESULT_LIMIT} shown` : "Run the set to view matches"}
          </div>
        </div>

        {!runExecuted ? (
          <EmptyState
            title="Run the set to show matches"
            description="Pick a baseline version and press Run to see the strongest job matches."
          />
        ) : runResults.length === 0 ? (
          <EmptyState
            title="No matches yet"
            description="Adjust the baseline or expand your filters and try again."
          />
        ) : (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            {runResults.map((result, index) => (
              <article
                key={`${result.jobId ?? index}-${index}`}
                style={{
                  padding: 16,
                  borderRadius: 12,
                  background: "rgba(15,23,42,0.6)",
                  border: "1px solid rgba(75,85,99,0.5)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>
                      {result.title ?? "Untitled role"}
                    </p>
                    <p style={{ margin: "4px 0 0", color: "rgba(226,232,240,0.75)" }}>
                      {result.company ?? "Company unknown"}
                      {result.jobId ? ` · ${result.jobId}` : ""}
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span
                      style={{
                        ...ttrComponents.chip,
                        padding: "4px 8px",
                        fontSize: 11,
                        background: "rgba(59,130,246,0.12)",
                      }}
                    >
                      {result.verdict ?? "Verdict pending"}
                    </span>
                    <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>
                      {typeof result.fitScore === "number" ? result.fitScore.toFixed(1) : "—"}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(226,232,240,0.6)" }}>Fit score</div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {result.applyUrl ? (
                    <a
                      href={result.applyUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        ...ttrComponents.primaryButton,
                        padding: "6px 12px",
                        fontSize: 13,
                        textDecoration: "none",
                      }}
                    >
                      Open apply link
                    </a>
                  ) : (
                    <span style={{ fontSize: 12, color: "rgba(226,232,240,0.6)" }}>
                      Apply link not available
                    </span>
                  )}
                  {result.sourceUrl ? (
                    <a
                      href={result.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#93c5fd", fontSize: 12 }}
                    >
                      View source
                    </a>
                  ) : null}
                </div>

                {result.dimensionScores ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {Object.entries(result.dimensionScores)
                      .filter(([, value]) => typeof value === "number")
                      .map(([dimension, value]) => (
                        <span key={dimension} style={ttrComponents.chip}>
                          {dimension.replace(/([A-Z])/g, " $1").trim()}: {(value as number).toFixed(1)}
                        </span>
                      ))}
                  </div>
                ) : null}

                {explanationEntries[index]?.length ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                    {explanationEntries[index].map((entry) => (
                      <div key={entry.key} style={{ fontSize: 12, color: "rgba(226,232,240,0.7)" }}>
                        <strong>{entry.label}:</strong> {entry.value}
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </InstrumentShell>
  );
}
