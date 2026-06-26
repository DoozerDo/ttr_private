import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { CX_FIT_SCORER_VERSION } from './analysis/cx-fit-scoring-v2';

describe('AppController', () => {
  let appController: AppController;
  const originalCommitSha = process.env.COMMIT_SHA;

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

  afterEach(() => {
    if (originalCommitSha === undefined) {
      delete process.env.COMMIT_SHA;
    } else {
      process.env.COMMIT_SHA = originalCommitSha;
    }
  });

  it('returns a health payload', () => {
    const response = appController.getHealth();

    expect(response).toMatchObject({ status: 'ok', service: 'api' });
    expect(response.timestamp).toBeDefined();
    expect(response.build).toMatchObject({
      marker: 'authority-gate-build-check-20260621',
      gitCommit: null,
      commitSha: null,
      buildTimestamp: null,
      appVersion: expect.anything(),
      scorerVersion: CX_FIT_SCORER_VERSION,
      resumeProjectEnabled: true,
    });
    expect(response.gitSha).toBe('unknown');
    expect(response.commitSha).toBe('unknown');
    expect(response.scorerVersion).toBe(CX_FIT_SCORER_VERSION);
    expect(response.resumeProjectEnabled).toBe(true);
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
        commitSha: expect.anything(),
        scorerVersion: CX_FIT_SCORER_VERSION,
        resumeProjectEnabled: true,
        startedAt: expect.any(String),
        uptimeSeconds: expect.any(Number),
        railway: expect.any(Object),
        build: expect.objectContaining({
          marker: 'authority-gate-build-check-20260621',
          gitCommit: null,
          commitSha: null,
          buildTimestamp: null,
          appVersion: expect.anything(),
          scorerVersion: CX_FIT_SCORER_VERSION,
          resumeProjectEnabled: true,
        }),
      }),
    );
    expect(typeof response.uptimeSeconds).toBe('number');
    expect(response.timestamp).toBeDefined();
  });

  it('surfaces the injected commit sha in build metadata', () => {
    process.env.COMMIT_SHA = 'test-commit-sha';

    const response = appController.getVersion();

    expect(response.gitSha).toBe('test-commit-sha');
    expect(response.commitSha).toBe('test-commit-sha');
    expect(response.build.gitCommit).toBe('test-commit-sha');
    expect(response.build.commitSha).toBe('test-commit-sha');
    expect(response.build.scorerVersion).toBe(CX_FIT_SCORER_VERSION);
    expect(response.build.resumeProjectEnabled).toBe(true);
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
        commitSha: expect.anything(),
        scorerVersion: CX_FIT_SCORER_VERSION,
        resumeProjectEnabled: true,
        startedAt: expect.any(String),
        uptimeSeconds: expect.any(Number),
        railway: expect.any(Object),
        build: expect.objectContaining({
          marker: 'authority-gate-build-check-20260621',
          gitCommit: null,
          commitSha: null,
          buildTimestamp: null,
          appVersion: expect.anything(),
          scorerVersion: CX_FIT_SCORER_VERSION,
          resumeProjectEnabled: true,
        }),
      }),
    );
    expect(response.status).toBe('ok');
    expect(response.service).toBe('api');
    expect(typeof response.uptimeSeconds).toBe('number');
    expect(response.timestamp).toBeDefined();
  });
});
