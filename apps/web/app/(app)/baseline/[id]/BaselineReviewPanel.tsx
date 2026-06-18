"use client";

import { useState } from "react";

import { Alert } from "@/components/Alert";
import { FormButton } from "@/components/FormButton";
import { reprocessBaseline, verifyBaseline } from "@/lib/baselines";
import { publishBaselineUpdated } from "@/src/lib/baseline-sync";

type ReviewPayload = {
  baselineParsedId: string;
  baselineFile: any;
  verified: boolean;
  verifiedAt: string | null;
} | null;

export function BaselineReviewPanel({
  baselineId,
  review,
}: {
  baselineId: string;
  review: ReviewPayload;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const baselineFile = review?.baselineFile ?? null;
  const diagnostics = baselineFile?.diagnostics ?? {};

  const onReprocess = async () => {
    setBusy("reprocess");
    try {
      await reprocessBaseline(baselineId);
      publishBaselineUpdated({ baselineId, source: "baseline" });
      window.location.reload();
    } finally {
      setBusy(null);
    }
  };

  const onVerify = async () => {
    setBusy("verify");
    try {
      await verifyBaseline(baselineId);
      publishBaselineUpdated({ baselineId, source: "baseline" });
      window.location.reload();
    } finally {
      setBusy(null);
    }
  };

  if (!baselineFile) {
    return <Alert intent="warning" title="No Baseline File available">Reprocess this baseline to build the normalized file.</Alert>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Baseline File Review</h2>
            <p className="text-sm text-gray-600">
              Verified: {review?.verified ? "yes" : "no"}{review?.verifiedAt ? ` on ${review.verifiedAt}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <FormButton onClick={onReprocess} disabled={busy !== null}>
              {busy === "reprocess" ? "Reprocessing..." : "Reprocess Baseline"}
            </FormButton>
            <FormButton onClick={onVerify} disabled={busy !== null || !baselineFile?.readiness?.usable}>
              {busy === "verify" ? "Verifying..." : "Mark Verified"}
            </FormButton>
          </div>
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm md:grid-cols-2">
        <Field label="Heading">{baselineFile.heading?.name ?? ""}</Field>
        <Field label="Contact Line">{baselineFile.heading?.contactLine ?? ""}</Field>
        <Field label="Summary" full>{baselineFile.summary ?? ""}</Field>
        <Field label="Skills / Competencies" full>{(baselineFile.skills ?? baselineFile.competencies ?? []).join(", ")}</Field>
        <Field label="Education" full>{JSON.stringify(baselineFile.education ?? [], null, 2)}</Field>
        <Field label="Certifications" full>{(baselineFile.certifications ?? []).join(", ")}</Field>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-3 text-lg font-semibold text-gray-900">Experience</h3>
        <div className="space-y-4">
          {(baselineFile.experience ?? []).map((entry: any, index: number) => (
            <article key={`${entry.company}-${index}`} className="rounded-md border border-gray-100 bg-gray-50 p-4">
              <div className="font-semibold text-gray-900">{entry.company} - {entry.roleTitle}</div>
              <div className="text-sm text-gray-600">{entry.dateRange ?? [entry.startDate, entry.endDate].filter(Boolean).join(" - ")}</div>
              <ul className="mt-2 list-disc pl-5 text-sm text-gray-800">
                {(entry.bullets ?? []).map((bullet: string, bulletIndex: number) => <li key={bulletIndex}>{bullet}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-3 text-lg font-semibold text-gray-900">Readiness Diagnostics</h3>
        <pre className="whitespace-pre-wrap text-sm text-gray-800">{JSON.stringify({
          missingRequiredFields: diagnostics.missingRequiredFields ?? [],
          validationReasons: diagnostics.validationReasons ?? [],
          validationFailures: diagnostics.validationFailures ?? [],
          readiness: baselineFile.readiness,
        }, null, 2)}</pre>
      </section>
    </div>
  );
}

function Field({ label, children, full = false }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 whitespace-pre-wrap rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-900">{children}</div>
    </div>
  );
}
