import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller()
export class AppController {
  constructor(private readonly config: ConfigService) {}

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('version')
  getVersion() {
    return {
      version: this.config.get<string>('APP_VERSION') ?? 'unknown',
      env: this.config.get<string>('NODE_ENV') ?? 'development',
      port: this.config.get<number>('PORT') ?? 3001,
      timestamp: new Date().toISOString(),
    };
  }
}
