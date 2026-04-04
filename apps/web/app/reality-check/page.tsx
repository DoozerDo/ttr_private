import { Suspense } from "react";

import RealityCheckClient from "./RealityCheckClient";

const LoadingFallback = () => (
  <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
    <div className="mx-auto max-w-3xl space-y-6 rounded-3xl border border-white/10 bg-slate-900/40 p-6">
      <p className="text-sm text-slate-400">Loading Reality Check…</p>
    </div>
  </div>
);

export default function RealityCheckPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <RealityCheckClient />
    </Suspense>
  );
}
