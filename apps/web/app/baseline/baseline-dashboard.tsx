"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { BaselineDto } from "../../lib/baselines";

interface BaselineDashboardProps {
  initialBaselines: BaselineDto[];
}

export function BaselineDashboard({ initialBaselines }: BaselineDashboardProps) {
  const [baselines, setBaselines] = useState<BaselineDto[]>(initialBaselines);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedBaselines = useMemo(
    () =>
      [...baselines].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [baselines],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!file) {
      setError("Please choose a PDF or DOCX file to upload.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setIsUploading(true);

    try {
      const response = await fetch("/api/baselines", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const data = await response.json();

      if (response.status === 401) {
        window.location.href = "/auth/login";
        return;
      }

      if (!response.ok) {
        const message = data?.message || data?.error || "Upload failed";
        setError(typeof message === "string" ? message : "Upload failed");
        return;
      }

      setBaselines((previous) => [data as BaselineDto, ...previous]);
      setFile(null);
    } catch (uploadError) {
      console.error("Upload failed", uploadError);
      setError("Unable to upload baseline right now.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-gray-900">Upload baseline</h2>
          <p className="text-sm text-gray-700">
            Upload your locked baseline résumé as a PDF or DOCX. We will store it securely and
            generate initial sections for tailoring later.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <input
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="w-full text-sm text-gray-900"
          />

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <button
            type="submit"
            disabled={isUploading}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isUploading ? "Uploading..." : "Upload baseline"}
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Your baselines</h2>
            <p className="text-sm text-gray-700">Latest uploads appear first.</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              setIsUploading(true);
              setError(null);
              try {
                const response = await fetch("/api/baselines", {
                  cache: "no-store",
                  credentials: "include",
                });
                const data = await response.json();
                if (response.status === 401) {
                  window.location.href = "/auth/login";
                  return;
                }

                if (!response.ok) {
                  throw new Error(data?.error || "Unable to refresh baselines");
                }
                setBaselines(data as BaselineDto[]);
              } catch (refreshError: any) {
                setError(refreshError?.message || "Unable to refresh baselines");
              } finally {
                setIsUploading(false);
              }
            }}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white shadow hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isUploading}
          >
            Refresh
          </button>
        </div>

        {sortedBaselines.length === 0 ? (
          <p className="mt-4 text-sm text-gray-700">No baselines uploaded yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-gray-200">
            {sortedBaselines.map((baseline) => (
              <li key={baseline.id} className="py-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-gray-900">
                      {baseline.originalFilename}
                    </p>
                    <p className="text-xs text-gray-600">
                      Uploaded {new Date(baseline.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <Link
                    href={`/baseline/${baseline.id}`}
                    className="text-sm font-semibold text-blue-600 hover:underline"
                  >
                    View details
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
