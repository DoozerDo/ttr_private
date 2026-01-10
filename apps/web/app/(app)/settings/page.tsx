import { PageHeader } from "@/components/PageHeader";

export default function SettingsPage() {
  return (
    <main className="space-y-6 rounded-2xl border border-white/10 bg-slate-900/60 p-6 shadow-lg">
      <PageHeader
        title="Account Settings"
        description="Review your session details, refresh credentials, or update billing contacts."
      />
      <section className="space-y-3 text-sm text-slate-300">
        <p>
          Settings are still under construction. We will add profile editing and multi-factor options soon.
        </p>
        <p>
          Reach out to your account team if you need help while this area is rolling out.
        </p>
      </section>
    </main>
  );
}
