"use client";

import { useEffect, useMemo, useState } from "react";

type LatestAnalysis = {
  baselineId: string;
  jobId: string;
  overallScore?: number;
  note?: string;
};

export default function ResultsPage() {
  const [baselineId, setBaselineId] = useState<string>("");
  const [jobId, setJobId] = useState<string>("");
  const [latest, setLatest] = useState<LatestAnalysis | null>(null);
  const [resumeResponse, setResumeResponse] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<"docx" | "pdf" | null>(null);

  const latestEndpoint = useMemo(() => {
    if (!jobId) return null;
    return `/api/analysis/job/${encodeURIComponent(jobId)}/latest`;
  }, [jobId]);

  async function loadLatest() {
    setError(null);
    setLatest(null);

    if (!jobId) {
      setError("Job ID is required to load analysis.");
      return;
    }

    try {
      if (!latestEndpoint) throw new Error("Job ID is required.");

      const res = await fetch(
        `/api/analysis/job/${encodeURIComponent(jobId)}/latest`,
        { cache: "no-store" },
      );

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }

      const data: LatestAnalysis = await res.json();
      setLatest(data);

      if (data?.baselineId) {
        setBaselineId(data.baselineId);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load analysis");
    }
  }

  async function generateResume(oneTap = false) {
    if (!baselineId || !jobId) {
      setError("Baseline and Job are required to generate a resume.");
      return;
    }

    setLoading(true);
    setError(null);
    setResumeResponse(null);

    try {
      const res = await fetch("/api/resume", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          baselineId,
          jobId,
          oneTap,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }

      const contentType = res.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        const json = await res.json();
        setResumeResponse(json);
      } else {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "resume";
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch (e: any) {
      setError(e?.message || "Resume generation failed");
    } finally {
      setLoading(false);
    }
  }

  async function exportResume(format: "docx" | "pdf") {
    if (!baselineId || !jobId) {
      setError("Baseline and Job are required to generate a resume.");
      return;
    }

    setExporting(format);
    setError(null);

    try {
      const res = await fetch(`/api/resume/export?format=${encodeURIComponent(format)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          baselineId,
          jobId,
          oneTap: true,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `resume.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message || "Resume export failed");
    } finally {
      setExporting(null);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const job = params.get("jobId");
    if (job) {
      setJobId(job);
    }
  }, []);

  const oneTapEligible = (latest?.overallScore ?? 0) >= 92;

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Results</h1>

      {error && (
        <div className="border border-red-400 bg-red-50 text-red-700 p-3 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        <div className="border rounded p-4 space-y-3">
          <h2 className="font-medium">Selection</h2>

          <div>
            <label className="block text-sm">Baseline</label>
            <input
              className="border rounded w-full p-2"
              value={baselineId}
              onChange={(e) => setBaselineId(e.target.value)}
              placeholder="Baseline ID"
            />
          </div>

          <div>
            <label className="block text-sm">Job</label>
            <input
              className="border rounded w-full p-2"
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              placeholder="Job ID"
            />
          </div>

          <button
            onClick={loadLatest}
            className="bg-gray-700 text-white px-4 py-2 rounded"
            disabled={!jobId}
          >
            Load latest analysis
          </button>

          <div className="text-xs text-gray-500">
            {latestEndpoint ? `Calling: ${latestEndpoint}` : ""}
          </div>
        </div>

      <div className="border rounded p-4">
        <h2 className="font-medium mb-2">Latest analysis</h2>
        <div className="flex items-center gap-3 mb-3">
          <button
            className="text-sm text-blue-600 underline disabled:text-gray-400"
              disabled={!latest?.jobId}
              onClick={() => {
                if (latest?.jobId) {
                  window.location.href = `/fit-review?jobId=${encodeURIComponent(latest.jobId)}`;
                }
              }}
            >
              Open Fit Review
            </button>
            <span className="text-xs text-gray-500">Job: {latest?.jobId ?? "n/a"}</span>
            <span className="text-xs text-gray-500">
              Fit Score: {latest?.overallScore ?? "n/a"}
            </span>
          </div>
          <pre className="text-sm whitespace-pre-wrap">
            {latest ? JSON.stringify(latest, null, 2) : ""}
          </pre>
        </div>
      </div>

      <div className="border rounded p-4 space-y-3">
        <h2 className="font-medium">Generate resume</h2>

        <button
          onClick={() => generateResume(false)}
          disabled={!baselineId || !jobId || loading}
          className="bg-gray-800 text-white px-4 py-2 rounded"
        >
          {loading ? "Generating..." : "Generate resume"}
        </button>

        <button
          onClick={() => generateResume(true)}
          disabled={!baselineId || !jobId || !oneTapEligible || loading}
          className="bg-emerald-700 text-white px-4 py-2 rounded disabled:bg-gray-300 disabled:text-gray-600"
          title={
            oneTapEligible
              ? "Generate immediately with compliance checks"
              : "Requires fit score of at least 92"
          }
        >
          {loading ? "Checking..." : "One tap generate (>=92 fit score)"}
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={() => exportResume("docx")}
            disabled={!baselineId || !jobId || !oneTapEligible || !!exporting}
            className="bg-blue-700 text-white px-4 py-2 rounded disabled:bg-gray-300 disabled:text-gray-600"
          >
            {exporting === "docx" ? "Downloading..." : "Download DOCX"}
          </button>
          <button
            onClick={() => exportResume("pdf")}
            disabled={!baselineId || !jobId || !oneTapEligible || !!exporting}
            className="bg-purple-700 text-white px-4 py-2 rounded disabled:bg-gray-300 disabled:text-gray-600"
          >
            {exporting === "pdf" ? "Downloading..." : "Download PDF"}
          </button>
        </div>

        <div>
          <label className="block text-sm">Resume response</label>
          <pre className="border rounded p-2 text-sm whitespace-pre-wrap">
            {resumeResponse ? JSON.stringify(resumeResponse, null, 2) : ""}
          </pre>
        </div>
      </div>
    </div>
  );
}
