import type { ConfigService } from '@nestjs/config';

type SupportEventContext = {
  user?: { id?: string; email?: string };
  environment?: string;
  extra?: Record<string, unknown>;
};

type SentryScope = {
  setTag: (key: string, value: string) => void;
  setUser: (user: { id?: string; email?: string }) => void;
  setExtras: (extras: Record<string, unknown>) => void;
};

type SentryClient = {
  init: (config: Record<string, unknown>) => void;
  withScope: (cb: (scope: SentryScope) => void) => void;
  captureMessage: (message: string) => string;
  flush: (timeoutMs: number) => Promise<boolean>;
};

let sentryInitialized = false;
let sentryClient: SentryClient | null = null;

function getSentryClient(): SentryClient | null {
  if (sentryClient) {
    return sentryClient;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@sentry/node') as SentryClient;
    sentryClient = mod;
    return sentryClient;
  } catch {
    return null;
  }
}

export function initSentry(config: ConfigService) {
  if (sentryInitialized) {
    return;
  }

  const dsn = config.get<string>('SENTRY_DSN');
  if (!dsn) {
    return;
  }

  const client = getSentryClient();
  if (!client) {
    return;
  }

  client.init({
    dsn,
    environment: config.get<string>('NODE_ENV') ?? 'development',
    release: config.get<string>('SENTRY_RELEASE') ?? undefined,
  });

  sentryInitialized = true;
}

export async function captureSupportEvent(
  message: string,
  context: SupportEventContext,
): Promise<string | null> {
  if (!sentryInitialized) {
    return null;
  }
  const client = getSentryClient();
  if (!client) {
    return null;
  }

  let eventId: string | null = null;

  client.withScope((scope) => {
    scope.setTag('feature', 'bug-report');
    if (context.environment) {
      scope.setTag('environment', context.environment);
    }

    if (context.user?.id) {
      scope.setUser({
        id: context.user.id,
        email: context.user.email,
      });
    }

    if (context.extra) {
      scope.setExtras(context.extra);
    }

    eventId = client.captureMessage(message);
  });

  await client.flush(2000);
  return eventId;
}

export function isSentryEnabled() {
  return sentryInitialized;
}
