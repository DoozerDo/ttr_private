import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  // Log anything that would otherwise kill a request or process silently
  process.on('unhandledRejection', (reason: any) => {
    // eslint-disable-next-line no-console
    console.error('unhandledRejection:', reason);
  });

  process.on('uncaughtException', (err: any) => {
    // eslint-disable-next-line no-console
    console.error('uncaughtException:', err);
  });

  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.useGlobalFilters(new AllExceptionsFilter());

  const corsOriginRaw =
    config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000';
  const corsOrigins = corsOriginRaw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }

      if (corsOrigins.includes('*') || corsOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'), false);
    },
  });

  const port = config.get<number>('PORT') ?? 3001;

  await app.listen(port, '0.0.0.0');
}
bootstrap();
