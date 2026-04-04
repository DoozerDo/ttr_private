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

    expect(response).toEqual(
      expect.objectContaining({
        version: expect.anything(),
        env: expect.anything(),
        port: expect.anything(),
        timestamp: expect.any(String),
        appVersion: expect.anything(),
        gitSha: expect.anything(),
        startedAt: expect.any(String),
        uptimeSeconds: expect.any(Number),
        railway: expect.any(Object),
      }),
    );
    expect(typeof response.uptimeSeconds).toBe('number');
    expect(response.timestamp).toBeDefined();
  });

  it('returns combined status payload', () => {
    const response = appController.getStatus();

    expect(response).toEqual(
      expect.objectContaining({
        status: 'ok',
        service: 'api',
        version: expect.anything(),
        env: expect.anything(),
        port: expect.anything(),
        timestamp: expect.any(String),
        appVersion: expect.anything(),
        gitSha: expect.anything(),
        startedAt: expect.any(String),
        uptimeSeconds: expect.any(Number),
        railway: expect.any(Object),
      }),
    );
    expect(response.status).toBe('ok');
    expect(response.service).toBe('api');
    expect(typeof response.uptimeSeconds).toBe('number');
    expect(response.timestamp).toBeDefined();
  });
});
