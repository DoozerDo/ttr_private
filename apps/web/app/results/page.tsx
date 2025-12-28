// apps/web/app/results/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';

type Id = string;

type Baseline = {
  id: Id;
  label?: string | null;
  name?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type Job = {
  id: Id;
  title?: string | null;
  company?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type ApiErrorShape = {
  message?: string;
  error?: string;
  statusCode?: number;
};

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function pickBaselineLabel(b: Baseline) {
  return (b.label ?? b.name ?? b.id).toString();
}

function pickJobLabel(j: Job) {
  const title = (j.title ?? '').toString().trim();
  const company = (j.company ?? '').toString().trim();
  if (company && title) return `${company} | ${title}`;
  return (title || company || j.id).toString();
}

async function apiFetch<T>(
  url: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; status: number; errorText: string }> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    credentials: 'include',
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (!res.ok) {
    const errorText = isJson ? safeStringify(await res.json().catch(() => ({}))) : await res.text().catch(() => '');
    return { ok: false, status: res.status, errorText: errorText || `Request failed with status ${res.status}` };
  }

  if (isJson) {
    const data = (await res.json().catch(() => null)) as T;
    return { ok: true, data };
  }

  // If a route returns non-JSON successfully, treat body as text.
  const text = (await res.text().catch(() => '')) as unknown as T;
  return { ok: true, data: text };
}

async function apiPostForDownloadOrJson(
  url: string,
  body: unknown,
): Promise<
  | { ok: true; kind: 'json'; data: unknown }
  | { ok: true; kind: 'file'; blob: Blob; filename: string }
  | { ok: false; status: number; errorText: string }
> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    credentials: 'include',
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (!res.ok) {
    const errorText = isJson ? safeStringify(await res.json().catch(() => ({}))) : await res.text().catch(() => '');
    return { ok: false, status: res.status, errorText: errorText || `Request failed with status ${res.status}` };
  }

  if (isJson) {
    const data = await res.json().catch(() => ({}));
    return { ok: true, kind: 'json', data };
  }

  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') || '';
  const match = /filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i.exec(cd);
  const filename = decodeURIComponent(match?.[1] ?? 'resume.docx');

  return { ok: true, kind: 'file', blob, filename };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Results() {
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [baselineId, setBaselineId] = useState<Id>('');
  const [jobId, setJobId] = useState<Id>('');

  const [loading, setLoading] = useState(false);
  const [loadingLatest, setLoadingLatest] = useState(false);
  const [generatingResume, setGeneratingResume] = useState(false);

  const [bannerError, setBannerError] = useState<string>('');
  const [latestAnalysisText, setLatestAnalysisText] = useState<string>('');
  const [resumeResponseText, setResumeResponseText] = useState<string>('');

  const selectedBaseline = useMemo(
    () => baselines.find((b) => b.id === baselineId) ?? null,
    [baselines, baselineId],
  );
  const selectedJob = useMemo(() => jobs.find((j) => j.id === jobId) ?? null, [jobs, jobId]);

  async function loadDropdownData() {
    setBannerError('');
    setLoading(true);

    const [bRes, jRes] = await Promise.all([
      apiFetch<Baseline[]>('/api/baselines', { method: 'GET' }),
      apiFetch<Job[]>('/api/jobs', { method: 'GET' }),
    ]);

    if (!bRes.ok) {
      setBannerError(`Baselines: ${bRes.status} ${bRes.errorText}`);
      setBaselines([]);
    } else {
      setBaselines(Array.isArray(bRes.data) ? bRes.data : []);
    }

    if (!jRes.ok) {
      setBannerError((prev) => (prev ? `${prev}\nJobs: ${jRes.status} ${jRes.errorText}` : `Jobs: ${jRes.status} ${jRes.errorText}`));
      setJobs([]);
    } else {
      setJobs(Array.isArray(jRes.data) ? jRes.data : []);
    }

    setLoading(false);
  }

  useEffect(() => {
    void loadDropdownData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onLoadLatest() {
    setBannerError('');
    setLatestAnalysisText('');
    setResumeResponseText('');

    if (!jobId) {
      setBannerError('Select a job first.');
      return;
    }

    setLoadingLatest(true);

    // API surface indicates: GET /api/analysis/job/:jobId/latest
    const res = await apiFetch<unknown>(`/api/analysis/job/${encodeURIComponent(jobId)}/latest`, { method: 'GET' });

    if (!res.ok) {
      setBannerError(`Latest analysis: ${res.status} ${res.errorText}`);
      setLoadingLatest(false);
      return;
    }

    setLatestAnalysisText(safeStringify(res.data));
    setLoadingLatest(false);
  }

  async function onGenerateResume() {
    setBannerError('');
    setResumeResponseText('');

    if (!baselineId || !jobId) {
      setBannerError('Select both a baseline and a job.');
      return;
    }

    setGeneratingResume(true);

    // Proxy inventory indicates: POST /api/resume -> /resume/generate
    const payload = { baselineId, jobId };
    const res = await apiPostForDownloadOrJson('/api/resume', payload);

    if (!res.ok) {
      setBannerError(`Resume: ${res.status} ${res.errorText}`);
      setGeneratingResume(false);
      return;
    }

    if (res.kind === 'file') {
      downloadBlob(res.blob, res.filename);
      setResumeResponseText(`Downloaded: ${res.filename}`);
    } else {
      setResumeResponseText(safeStringify(res.data));
    }

    setGeneratingResume(false);
  }

  const quickContext = useMemo(() => {
    return {
      baseline: selectedBaseline ? pickBaselineLabel(selectedBaseline) : '(none)',
      job: selectedJob ? pickJobLabel(selectedJob) : '(none)',
    };
  }, [selectedBaseline, selectedJob]);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Results</h1>
          <p className="text-sm text-gray-500">View the latest analysis and generate outputs.</p>
        </div>

        <button
          className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
          onClick={() => void loadDropdownData()}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {bannerError ? (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 whitespace-pre-wrap">
          {bannerError}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border bg-white p-5">
          <h2 className="mb-4 text-lg font-semibold">Selection</h2>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Baseline</label>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={baselineId}
                onChange={(e) => setBaselineId(e.target.value)}
              >
                <option value="">Select baseline</option>
                {baselines.map((b) => (
                  <option key={b.id} value={b.id}>
                    {pickBaselineLabel(b)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Job</label>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
              >
                <option value="">Select job</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {pickJobLabel(j)}
                  </option>
                ))}
              </select>
            </div>

            <button
              className="w-full rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
              onClick={() => void onLoadLatest()}
              disabled={loadingLatest || !jobId}
              title={!jobId ? 'Select a job to load the latest analysis.' : ''}
            >
              {loadingLatest ? 'Loading...' : 'Load latest analysis'}
            </button>

            <div className="rounded-md border bg-gray-50 p-3 text-sm">
              <div className="font-medium">Quick context</div>
              <div className="mt-2 space-y-1 text-gray-700">
                <div>
                  <span className="font-medium">Selected baseline label:</span> {quickContext.baseline}
                </div>
                <div>
                  <span className="font-medium">Selected job label:</span> {quickContext.job}
                </div>
                <div className="pt-2 text-xs text-gray-500">This panel is informational only.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-white p-5">
          <h2 className="mb-2 text-lg font-semibold">Latest analysis</h2>
          <p className="mb-3 text-xs text-gray-500">Latest analysis result for the selected job.</p>

          <textarea
            className="h-56 w-full resize-none rounded-md border px-3 py-2 text-xs"
            value={latestAnalysisText}
            onChange={(e) => setLatestAnalysisText(e.target.value)}
            placeholder="{}"
          />
        </div>

        <div className="rounded-lg border bg-white p-5">
          <h2 className="mb-2 text-lg font-semibold">Generate resume</h2>
          <p className="mb-3 text-xs text-gray-500">Generates a resume for the selected baseline and job.</p>

          <button
            className="w-full rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
            onClick={() => void onGenerateResume()}
            disabled={generatingResume || !baselineId || !jobId}
            title={!baselineId || !jobId ? 'Select both a baseline and a job.' : ''}
          >
            {generatingResume ? 'Generating...' : 'Generate resume'}
          </button>

          <p className="mt-3 text-xs text-gray-500">
            If the API returns a file, it will download automatically. If it returns JSON, it will display below.
          </p>

          <label className="mt-4 block text-sm font-medium">Resume response</label>
          <textarea
            className="mt-2 h-40 w-full resize-none rounded-md border px-3 py-2 text-xs"
            value={resumeResponseText}
            onChange={(e) => setResumeResponseText(e.target.value)}
            placeholder="{}"
          />
        </div>
      </div>
    </div>
  );
}
