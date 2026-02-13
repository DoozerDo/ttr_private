import { Suspense } from "react";

import ConfirmClient from "./ConfirmClient";

const ConfirmFallback = () => (
  <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
    <div className="mx-auto w-full max-w-md space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold text-gray-900">Email Confirmation</h1>
      <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">Confirming your email...</p>
    </div>
  </main>
);

export default function ConfirmPage() {
  return (
    <Suspense fallback={<ConfirmFallback />}>
      <ConfirmClient />
    </Suspense>
  );
}
