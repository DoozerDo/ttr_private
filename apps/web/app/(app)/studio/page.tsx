import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";

export default function StudioPage() {
  return (
    <PageShell className="space-y-6">
      <PageHeader
        title="Resume and Cover Letter Studio"
        description="Draft, refine, and download your job materials inside your authenticated workspace."
      />

      <section className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-6">
        <h2 className="text-lg font-semibold text-slate-100">Resume and Cover Letter Studio</h2>
        <p className="text-sm text-slate-300">
          This is a placeholder studio space that keeps the authenticated shell intact while an editor is still in
          development.
        </p>
        <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-4 text-sm text-slate-300">
          Content coming soon.
        </div>
      </section>
    </PageShell>
  );
}
