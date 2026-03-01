import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(() => undefined),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('returns a health payload', () => {
    const response = appController.getHealth();

    expect(response).toMatchObject({ status: 'ok', service: 'api' });
    expect(response.timestamp).toBeDefined();
  });

  it('returns a root health payload', () => {
    const response = appController.getRootHealth();

    expect(response).toMatchObject({ status: 'ok', service: 'api' });
    expect(response.timestamp).toBeDefined();
  });

  it('returns version metadata with fallbacks', () => {
    const response = appController.getVersion();

    expect(response).toMatchObject({
      version: 'unknown',
      env: 'development',
      port: 3001,
    });
    expect(response.timestamp).toBeDefined();
  });

  it('returns combined status payload', () => {
    const response = appController.getStatus();

    expect(response).toMatchObject({
      status: 'ok',
      service: 'api',
      version: 'unknown',
      env: 'development',
      port: 3001,
    });
    expect(response.timestamp).toBeDefined();
  });
});
