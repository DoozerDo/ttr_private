import { Suspense } from "react";
import FitReviewClient from "./FitReviewClient";

export default function FitReviewPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: "rgba(226,232,240,0.8)" }}>Loading…</div>}>
      <FitReviewClient />
    </Suspense>
  );
}
