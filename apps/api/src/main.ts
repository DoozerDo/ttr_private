import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

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
  }

  const port = config.get<number>('PORT') ?? 3001;

  await app.listen(port, '0.0.0.0');
}
bootstrap();
