"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CoverLettersPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/results?documentType=cover-letter");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-slate-400">Redirecting to the Results page...</p>
    </div>
  );
}
