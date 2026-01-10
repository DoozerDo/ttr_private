"use client";

import { useCallback, useEffect, useState } from "react";

type StatusResponse = {
  status: string;
  service: string;
  version: string;
  env: string;
  port: number;
  timestamp: string;
};

export function StatusSection() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStatus = useCallback(() => {
    setIsLoading(true);

    fetch("/api/status")
      .then(async (res) => {
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          const message = data?.error ?? `HTTP ${res.status}`;
          throw new Error(message);
        }
        const data = (await res.json()) as StatusResponse;
        setStatus(data);
        setError(null);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message);
        setStatus(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    // Initial load should still hydrate status from the API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStatus();
  }, [fetchStatus]);

  return (
    <section className="w-full max-w-3xl space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">API Status</h2>
        <button
          onClick={fetchStatus}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow hover:bg-blue-500"
          disabled={isLoading}
        >
          Refresh
        </button>
      </div>

      {status && (
        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-4 text-sm">
          <div>
            <dt className="font-semibold text-gray-700">Service</dt>
            <dd className="text-gray-900">{status.service}</dd>
          </div>
          <div>
            <dt className="font-semibold text-gray-700">Status</dt>
            <dd className="text-gray-900">{status.status}</dd>
          </div>
          <div>
            <dt className="font-semibold text-gray-700">Version</dt>
            <dd className="text-gray-900">{status.version}</dd>
          </div>
          <div>
            <dt className="font-semibold text-gray-700">Environment</dt>
            <dd className="text-gray-900">{status.env}</dd>
          </div>
          <div>
            <dt className="font-semibold text-gray-700">Port</dt>
            <dd className="text-gray-900">{status.port}</dd>
          </div>
          <div className="col-span-2">
            <dt className="font-semibold text-gray-700">Timestamp</dt>
            <dd className="text-gray-900">{status.timestamp}</dd>
          </div>
        </dl>
      )}

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Failed to reach API: {error}
        </p>
      )}

      {isLoading && (
        <p className="text-sm text-gray-600">Checking API status…</p>
      )}
    </section>
  );
}
