import { PageShell } from "@/components/PageShell";
import { RealityCheckClient } from "./RealityCheckClient";

type RealityCheckPageProps = {
  params: { jobId: string };
  searchParams?: { baselineId?: string };
};

export default function RealityCheckPage({ params, searchParams }: RealityCheckPageProps) {
  const baselineId = searchParams?.baselineId?.trim() || null;

  return (
    <PageShell>
      <RealityCheckClient jobId={params.jobId} baselineId={baselineId} />
    </PageShell>
  );
}
