'use client';

import { useEffect, useState } from 'react';

type HealthResponse = {
  status: string;
  service: string;
  timestamp: string;
};

export default function Home() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

    if (!baseUrl) {
      setError('NEXT_PUBLIC_API_BASE_URL is not set');
      return;
    }

    fetch(`${baseUrl}/health`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as HealthResponse;
        setHealth(data);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message);
      });
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold">Target This Role – Dev Dashboard</h1>

      {health && (
        <pre className="bg-gray-100 rounded-md p-4 text-sm">
          {JSON.stringify(health, null, 2)}
        </pre>
      )}

      {error && (
        <p className="text-red-600 text-sm">
          Failed to reach API: {error}
        </p>
      )}

      {!health && !error && (
        <p className="text-sm text-gray-600">Checking API health…</p>
      )}
    </main>
  );
}
