import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { requestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import { initSentry } from './common/sentry';
import { DataSource } from 'typeorm';

type ExpressLayer = {
  name?: string;
  route?: {
    path?: string | string[];
    methods?: Record<string, boolean>;
  };
  handle?: {
    stack?: ExpressLayer[];
  };
  regexp?: RegExp & { fast_slash?: boolean };
};

function cleanPath(path: string): string {
  const normalized = path.replace(/\/{2,}/g, '/');
  return normalized === '' ? '/' : normalized;
}

function extractMountPath(layer: ExpressLayer): string {
  if (!layer.regexp || layer.regexp.fast_slash) {
    return '';
  }

  const source = layer.regexp.toString();
  const match = source.match(/^\/\^\\\/(.*)\\\/\?\(\?=\\\/\|\$\)\/i$/);
  if (!match?.[1]) {
    return '';
  }

  const raw = match[1]
    .replace(/\\\//g, '/')
    .replace(/\(\?:\(\[\^\\\/]\+\?\)\)/g, ':param')
    .replace(/\$$/g, '');

  return raw ? `/${raw}` : '';
}

function collectRoutes(stack: ExpressLayer[], prefix = ''): string[] {
  const routes: string[] = [];

  for (const layer of stack) {
    if (layer.route?.path) {
      const paths = Array.isArray(layer.route.path)
        ? layer.route.path
        : [layer.route.path];
      const methods = Object.entries(layer.route.methods ?? {})
        .filter(([, enabled]) => Boolean(enabled))
        .map(([method]) => method.toUpperCase());

      for (const path of paths) {
        const fullPath = cleanPath(`${prefix}${path}`);
        for (const method of methods) {
          routes.push(`ROUTE ${method} ${fullPath}`);
        }
      }
      continue;
    }

    if (layer.name === 'router' && Array.isArray(layer.handle?.stack)) {
      const mountPath = extractMountPath(layer);
      routes.push(...collectRoutes(layer.handle.stack, `${prefix}${mountPath}`));
    }
  }

  return routes;
}

async function bootstrap() {
  // Log anything that would otherwise kill a request or process silently
  process.on('unhandledRejection', (reason: any) => {
    console.error('unhandledRejection:', reason);
  });

  process.on('uncaughtException', (err: any) => {
    console.error('uncaughtException:', err);
  });

  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const dataSource = app.get(DataSource);
  initSentry(config);

  app.use(requestLoggerMiddleware);
  app.use(cookieParser());

  app.useGlobalFilters(new AllExceptionsFilter());

  const corsOriginRaw =
    config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000';
  const envOrigins = corsOriginRaw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const defaultOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];
  const corsOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

  const corsOptions = {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        return callback(null, true);
      }

      if (corsOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204,
  };

  app.enableCors(corsOptions);

  const isProduction = config.get<string>('NODE_ENV') === 'production';
  if (!isProduction) {
    console.log(
      `DEV CORS allowlist: ${corsOrigins.join(', ')}; credentials enabled`,
    );
    const appPublicWebUrl =
      config.get<string>('APP_PUBLIC_WEB_URL') ?? process.env.APP_PUBLIC_WEB_URL;
    const jwtSecret = config.get<string>('JWT_SECRET') ?? process.env.JWT_SECRET;
    const requireAccessCode =
      config.get<string>('REQUIRE_ACCESS_CODE') ?? process.env.REQUIRE_ACCESS_CODE;
    const requireAccessCodeState =
      typeof requireAccessCode === 'string' &&
      ['true', 'false'].includes(requireAccessCode.trim().toLowerCase())
        ? requireAccessCode.trim().toLowerCase()
        : 'missing_or_invalid';
    console.log(
      `[DEV CONFIG] APP_PUBLIC_WEB_URL=${
        appPublicWebUrl && appPublicWebUrl.trim().length > 0
          ? 'present'
          : 'missing'
      } JWT_SECRET=${jwtSecret && jwtSecret.trim().length > 0 ? 'present' : 'missing'} REQUIRE_ACCESS_CODE=${requireAccessCodeState}`,
    );
    console.log(
      `[DEV CONFIG] Source precedence: compose environment > compose env_file > process env`,
    );
    console.log(
      `[DEV CONFIG] Effective APP_PUBLIC_WEB_URL=${appPublicWebUrl?.trim() || 'unset'}`
    );
  }

  const shouldRunMigrationsRaw = config.get<string>('TYPEORM_RUN_MIGRATIONS');
  const shouldRunMigrations =
    shouldRunMigrationsRaw === undefined
      ? config.get<string>('NODE_ENV') !== 'test'
      : shouldRunMigrationsRaw.toLowerCase() === 'true';

  if (shouldRunMigrations) {
    try {
      const migrations = await dataSource.runMigrations();
      if (migrations.length > 0) {
        console.log(
          `[DB MIGRATIONS] Applied migrations: ${migrations
            .map((m) => m.name)
            .join(', ')}`,
        );
      } else {
        console.log('[DB MIGRATIONS] No pending migrations.');
      }
    } catch (error) {
      console.error('[DB MIGRATIONS] Failed to run migrations on startup.', error);
    }
  } else {
    console.log('[DB MIGRATIONS] Skipped (TYPEORM_RUN_MIGRATIONS=false).');
  }

  try {
    const tableResult = (await dataSource.query(
      `SELECT to_regclass('public.bug_reports') AS bug_reports_regclass`,
    )) as Array<{ bug_reports_regclass: string | null }>;
    const exists = Boolean(tableResult?.[0]?.bug_reports_regclass);
    if (!exists) {
      console.error('[SCHEMA CHECK] bug_reports table is missing.');
    } else {
      const columns = (await dataSource.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'bug_reports'`,
      )) as Array<{ column_name: string }>;
      const existingColumns = new Set(columns.map((item) => item.column_name));
      const expectedColumns = [
        'id',
        'user_id',
        'reporter_email',
        'what_happened',
        'attempted_action',
        'expected_behavior',
        'route',
        'page_label',
        'app_version',
        'git_sha',
        'baseline_id',
        'assessment_id',
        'fit_score',
        'browser_info',
        'viewport',
        'runtime_context',
        'screenshot_storage_path',
        'screenshot_original_filename',
        'screenshot_mime_type',
        'screenshot_size_bytes',
        'status',
        'severity',
        'triage_notes',
        'resolved_at',
        'resolved_by_user_id',
        'created_at',
        'updated_at',
      ];
      const missing = expectedColumns.filter((column) => !existingColumns.has(column));
      if (missing.length > 0) {
        console.error(
          `[SCHEMA CHECK] bug_reports is missing columns: ${missing.join(', ')}`,
        );
      } else {
        console.log('[SCHEMA CHECK] bug_reports table present with expected columns.');
      }
    }
  } catch (error) {
    console.error('[SCHEMA CHECK] Unable to verify bug_reports schema.', error);
  }

  await app.init();
  console.log('ROUTE_DUMP_START', new Date().toISOString());

  const server = app.getHttpAdapter().getInstance() as {
    _router?: { stack?: ExpressLayer[] };
  };
  const routeLines = collectRoutes(server._router?.stack ?? []);
  for (const line of routeLines) {
    console.log(line);
  }
  console.log('ROUTE_DUMP_END', new Date().toISOString());

  const port = config.get<number>('PORT') ?? 3001;

  await app.listen(port, '0.0.0.0');
}

bootstrap().catch((error) => {
  console.error('bootstrap failed', error);
  process.exit(1);
});

