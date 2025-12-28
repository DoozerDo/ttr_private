// apps/web/app/lib/api.ts
'use client';

type ApiError = {
  message?: string | string[];
  error?: string;
  statusCode?: number;
};

function errorMessageFromPayload(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;

  const p = payload as ApiError;

  if (Array.isArray(p.message)) return p.message.join(', ');
  if (typeof p.message === 'string' && p.message.trim()) return p.message;

  if (typeof p.error === 'string' && p.error.trim()) return p.error;

  return fallback;
}

function redirectToLoginIfNeeded(res: Response) {
  if (res.status !== 401) return;

  // Client-side redirect to login with return path
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/auth/login?next=${next}`;
}

export async function apiFetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    redirectToLoginIfNeeded(res);

    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    let payload: unknown = null;

    try {
      payload = isJson ? await res.json() : await res.text();
    } catch {
      payload = null;
    }

    const fallback = `Request failed with status ${res.status}`;
    const msg = isJson
      ? errorMessageFromPayload(payload, fallback)
      : (typeof payload === 'string' && payload.trim()) ? payload : fallback;

    throw new Error(msg);
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Expected JSON response');
  }

  return (await res.json()) as T;
}

export async function apiFetchFileOrJson(
  url: string,
  body: unknown,
): Promise<
  { kind: 'file'; blob: Blob; contentType: string } | { kind: 'json'; data: unknown }
> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    cache: 'no-store',
  });

  if (!res.ok) {
    redirectToLoginIfNeeded(res);

    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    let payload: unknown = null;

    try {
      payload = isJson ? await res.json() : await res.text();
    } catch {
      payload = null;
    }

    const fallback = `Request failed with status ${res.status}`;
    const msg = isJson
      ? errorMessageFromPayload(payload, fallback)
      : (typeof payload === 'string' && payload.trim()) ? payload : fallback;

    throw new Error(msg);
  }

  const contentType = res.headers.get('content-type') || '';

  const isDocx = contentType.includes(
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
  const isPdf = contentType.includes('application/pdf');
  const isOctet = contentType.includes('application/octet-stream');

  if (isDocx || isPdf || isOctet) {
    const blob = await res.blob();
    return { kind: 'file', blob, contentType };
  }

  if (contentType.includes('application/json')) {
    const data = await res.json();
    return { kind: 'json', data };
  }

  const text = await res.text();
  return { kind: 'json', data: { raw: text } };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
