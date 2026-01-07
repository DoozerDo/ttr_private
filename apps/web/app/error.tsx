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

export default function ErrorPage({ error, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    console.error("Unhandled error boundary", error);
  }, [error]);

  return (
    <PageShell>
      <div className="space-y-6">
        <PageHeader
          title="Something went wrong"
          description="We're having trouble loading the page. Try again to continue."
        />
        <Alert intent="error">
          <p>We captured the failure and logged it for later. Hit the button below to reload.</p>
        </Alert>
        <FormButton onClick={() => reset()}>Try again</FormButton>
      </div>
    </PageShell>
  );
}
