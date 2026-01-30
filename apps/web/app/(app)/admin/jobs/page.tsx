import Link from "next/link";
import { adminServerFetch } from "../_lib/adminServerFetch";

type AdminJobRow = {
  id: string;
  title: string | null;
  userId: string;
  createdAt: string;
};

async function loadJobs(): Promise<AdminJobRow[]> {
  return adminServerFetch<AdminJobRow[]>("/jobs?includeArchived=true", "Load jobs");
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

export default async function AdminJobsPage() {
  const jobs = await loadJobs();

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.4em] text-slate-400">
          Jobs
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-50">
          Job records
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          A read-only list of jobs created via the platform.
        </p>
      </header>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-lg shadow-black/40">
        <div className="px-4 py-3 text-xs uppercase tracking-[0.25em] text-slate-400">
          Jobs
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-slate-900/80 text-left text-xs uppercase tracking-[0.2em] text-slate-400">
              <tr>
                <th className="px-4 py-3">Job ID</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Created by</th>
                <th className="px-4 py-3">Created at</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-t border-white/10">
                  <td className="px-4 py-3">
                    <Link
                      className="text-amber-300 hover:text-amber-200"
                      href={`/admin/jobs/${job.id}`}
                    >
                      {job.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-100">
                    {job.title ?? "Untitled"}
                  </td>
                  <td className="px-4 py-3 text-slate-200">{job.userId}</td>
                  <td className="px-4 py-3 text-slate-200">
                    {formatDate(job.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
