import { NextRequest, NextResponse } from 'next/server';
import { getApiBaseUrl, relayApiResponse, requireAuthToken } from '../baselines/helpers';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function GET(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);

  if (!baseUrl) return NextResponse.json({ error: 'API base URL is not configured' }, { status: 500 });
  if (!auth.token) return auth.error;

  const response = await fetch(`${baseUrl}/search-sets`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${auth.token}`,
      Cookie: req.headers.get('cookie') ?? '',
    },
  });

  return relayApiResponse(response);
}

export async function POST(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);

  if (!baseUrl) return NextResponse.json({ error: 'API base URL is not configured' }, { status: 500 });
  if (!auth.token) return auth.error;

  const body = await req.json().catch(() => ({}));

  const response = await fetch(`${baseUrl}/search-sets`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth.token}`,
      'Content-Type': 'application/json',
      Cookie: req.headers.get('cookie') ?? '',
    },
    body: JSON.stringify(body),
  });

  return relayApiResponse(response);
}
