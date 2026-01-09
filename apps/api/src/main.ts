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

  const corsOrigin =
    config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000';

  app.enableCors({
    origin: corsOrigin,
  });

  const port = config.get<number>('PORT') ?? 3001;

  await app.listen(port);
}
bootstrap();
