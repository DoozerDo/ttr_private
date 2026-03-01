import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller()
export class AppController {
  constructor(private readonly config: ConfigService) {}

  private getTimestamp() {
    return new Date().toISOString();
  }

  private getHealthPayload() {
    return {
      status: 'ok',
      service: 'api',
      timestamp: this.getTimestamp(),
    };
  }

  @Get()
  getRootHealth() {
    return this.getHealthPayload();
  }

  @Get('health')
  getHealth() {
    return this.getHealthPayload();
  }

  @Get('version')
  getVersion() {
    return {
      version: this.config.get<string>('APP_VERSION') ?? 'unknown',
      env: this.config.get<string>('NODE_ENV') ?? 'development',
      port: this.config.get<number>('PORT') ?? 3001,
      timestamp: this.getTimestamp(),
    };
  }

  @Get('status')
  getStatus() {
    return {
      status: 'ok',
      service: 'api',
      version: this.config.get<string>('APP_VERSION') ?? 'unknown',
      env: this.config.get<string>('NODE_ENV') ?? 'development',
      port: this.config.get<number>('PORT') ?? 3001,
      timestamp: this.getTimestamp(),
    };
  }
}
