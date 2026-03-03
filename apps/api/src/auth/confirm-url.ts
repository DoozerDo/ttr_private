const LOCAL_WEB_BASE_URL = 'http://localhost:3000';
const CONFIRM_PATH = '/auth/confirm';

export function resolvePublicWebBaseUrl(input: {
  nodeEnv?: string;
  appPublicWebUrl?: string;
}): string {
  const configured = input.appPublicWebUrl?.trim();
  if (configured) {
    return configured.replace(/\/+$/, '');
  }

  if (input.nodeEnv === 'development') {
    return LOCAL_WEB_BASE_URL;
  }

  throw new Error(
    'Missing APP_PUBLIC_WEB_URL environment variable. Set it to the public web origin (for example https://targetthisrole.com).',
  );
}

export function buildAbsoluteUrl(input: {
  baseUrl: string;
  path: string;
  query?: Record<string, string>;
}): string {
  const normalizedBase = input.baseUrl.trim();
  const baseWithSlash = normalizedBase.endsWith('/')
    ? normalizedBase
    : `${normalizedBase}/`;
  const normalizedPath = input.path.replace(/^\/+/, '');
  const url = new URL(normalizedPath, baseWithSlash);

  for (const [key, value] of Object.entries(input.query ?? {})) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

export function buildConfirmationUrl(baseUrl: string, token: string): string {
  return buildAbsoluteUrl({
    baseUrl,
    path: CONFIRM_PATH,
    query: { token },
  });
}
