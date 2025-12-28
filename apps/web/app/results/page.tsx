"use client";

import { useEffect, useState } from "react";

type LatestAnalysis = {
  baselineId: string;
  jobId: string;
  note?: string;
};

export default function ResultsPage() {
  const [baselineId, setBaselineId] = useState<string>("");
  const [jobId, setJobId] = useState<string>("");
  const [latest, setLatest] = useState<LatestAnalysis | null>(null);
  const [resumeResponse, setResumeResponse] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadLatest() {
    setError(null);
    try {
      const res = await fetch(
        `/api/analysis/latest?jobId=${encodeURIComponent(jobId)}`,
        { cache: "no-store" },
      );

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }

      const data = await res.json();
      setLatest(data);
    } catch (e: any) {
      setError(e.message || "Failed to load analysis");
    }
  }

  async function generateResume() {
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
      setError(e.message || "Resume generation failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const job = params.get("jobId");
    if (job) {
      setJobId(job);
    }
  }, []);

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
        </div>

        <div className="border rounded p-4">
          <h2 className="font-medium mb-2">Latest analysis</h2>
          <pre className="text-sm whitespace-pre-wrap">
            {latest ? JSON.stringify(latest, null, 2) : ""}
          </pre>
        </div>
      </div>

      <div className="border rounded p-4 space-y-3">
        <h2 className="font-medium">Generate resume</h2>

        <button
          onClick={generateResume}
          disabled={!baselineId || !jobId || loading}
          className="bg-gray-800 text-white px-4 py-2 rounded"
        >
          {loading ? "Generating..." : "Generate resume"}
        </button>

        <div>
          <label className="block text-sm">Resume response</label>
          <pre className="border rounded p-2 text-sm whitespace-pre-wrap">
            {resumeResponse
              ? JSON.stringify(resumeResponse, null, 2)
              : ""}
          </pre>
        </div>
      </div>
    </div>
  );
}
