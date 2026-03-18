import type { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';

type SupportEventContext = {
  user?: { id?: string; email?: string };
  environment?: string;
  extra?: Record<string, unknown>;
};

let sentryInitialized = false;

export function initSentry(config: ConfigService) {
  if (sentryInitialized) {
    return;
  }

  const dsn = config.get<string>('SENTRY_DSN');
  if (!dsn) {
    return;
  }

  Sentry.init({
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

  let eventId: string | null = null;

  Sentry.withScope((scope) => {
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

    eventId = Sentry.captureMessage(message);
  });

  await Sentry.flush(2000);
  return eventId;
}

export function isSentryEnabled() {
  return sentryInitialized;
}
