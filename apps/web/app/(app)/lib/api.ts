// apps/web/app/lib/api.ts
'use client';

import {
  formatErrorMessage,
  getPayloadErrorCode,
  readResponsePayload,
} from "@/lib/compliance/parseComplianceError";
import {
  ClientRequestTimeoutError,
  fetchWithTimeout,
} from "@/lib/fetchWithTimeout";

export class ApiResponseError extends Error {
  status: number;
  payload: unknown;
  errorCode?: string;

  constructor(message: string, status: number, payload: unknown, errorCode?: string) {
    super(message);
    this.status = status;
    this.payload = payload;
    this.errorCode = errorCode;
  }
}

type TimeoutCapableRequestInit = RequestInit & {
  timeoutMs?: number;
};

function redirectToLoginIfNeeded(res: Response) {
  if (res.status !== 401) return;

  // Client-side redirect to login with return path
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/auth/login?next=${next}`;
}

export async function apiFetchJson<T>(
  input: RequestInfo | URL,
  init?: TimeoutCapableRequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetchWithTimeout(input, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      cache: 'no-store',
    }, {
      timeoutMs: init?.timeoutMs,
    });
  } catch (error) {
    if (error instanceof ClientRequestTimeoutError) {
      throw new ApiResponseError(
        error.message,
        error.status,
        error.payload,
        'timeout',
      );
    }
    throw error;
  }

  if (!res.ok) {
    redirectToLoginIfNeeded(res);

    const payload = await readResponsePayload(res);
    const fallback = `Request failed with status ${res.status}`;
    const message = formatErrorMessage(payload, fallback);
    const errorCode = getPayloadErrorCode(payload);

    throw new ApiResponseError(message, res.status, payload, errorCode);
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
  init?: TimeoutCapableRequestInit,
): Promise<
  { kind: 'file'; blob: Blob; contentType: string } | { kind: 'json'; data: unknown }
> {
  let res: Response;
  try {
    res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      cache: 'no-store',
      ...init,
    }, {
      timeoutMs: init?.timeoutMs,
    });
  } catch (error) {
    if (error instanceof ClientRequestTimeoutError) {
      throw new ApiResponseError(
        error.message,
        error.status,
        error.payload,
        'timeout',
      );
    }
    throw error;
  }

  if (!res.ok) {
    redirectToLoginIfNeeded(res);

    const payload = await readResponsePayload(res);
    const fallback = `Request failed with status ${res.status}`;
    const message = formatErrorMessage(payload, fallback);
    const errorCode = getPayloadErrorCode(payload);

    throw new ApiResponseError(message, res.status, payload, errorCode);
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
