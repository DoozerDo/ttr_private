"use client";

import { useEffect } from "react";

import { Alert } from "@/components/Alert";
import { FormButton } from "@/components/FormButton";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";

type ErrorBoundaryProps = {
  error: Error;
  reset: () => void;
};

export default function BaselineErrorPage({ error, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    console.error("Unhandled Baseline render error", error);
  }, [error]);

  return (
    <PageShell>
      <div className="space-y-6">
        <PageHeader
          title="Something broke while generating your results."
          description="Something broke while generating your results. Check console."
        />
        <Alert intent="error">
          <p>Something broke while generating your results. Check console.</p>
        </Alert>
        <FormButton onClick={() => reset()}>Try again</FormButton>
      </div>
    </PageShell>
  );
}
