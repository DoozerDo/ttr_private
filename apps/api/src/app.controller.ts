import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CX_FIT_SCORER_VERSION } from './analysis/cx-fit-scoring-v2';

const SERVICE_STARTED_AT = new Date();

@Controller()
export class AppController {
  constructor(private readonly config: ConfigService) {}

  private getTimestamp() {
    return new Date().toISOString();
  }

  private getGitCommit(): string | null {
    const candidates = [
      process.env.RAILWAY_GIT_COMMIT_SHA,
      process.env.RAILWAY_GIT_COMMIT,
      process.env.GITHUB_SHA,
      process.env.VERCEL_GIT_COMMIT_SHA,
      process.env.COMMIT_SHA,
    ];

    for (const candidate of candidates) {
      if (candidate && candidate.trim()) {
        return candidate;
      }
    }

    return null;
  }

  private getBuildTimestamp(): string | null {
    const candidates = [
      process.env.BUILD_TIMESTAMP,
      process.env.APP_BUILD_TIMESTAMP,
      process.env.RAILWAY_DEPLOYMENT_CREATED_AT,
    ];

    for (const candidate of candidates) {
      if (candidate && candidate.trim()) {
        return candidate;
      }
    }

    return null;
  }

  private getScoringMetadata() {
    return {
      scorerVersion: CX_FIT_SCORER_VERSION,
      resumeProjectEnabled: true,
    };
  }

  private getAppVersion(): string {
    const configuredVersion = this.config.get<string>('APP_VERSION');
    if (configuredVersion && configuredVersion.trim()) {
      return configuredVersion;
    }

    try {
      const pkgPath = join(process.cwd(), 'package.json');
      const pkgRaw = readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgRaw) as { version?: string };
      if (pkg.version && pkg.version.trim()) {
        return pkg.version;
      }
    } catch {
      return 'unknown';
    }

    return 'unknown';
  }

  private getRailwayMeta() {
    return {
      railwayPublicDomain: process.env.RAILWAY_PUBLIC_DOMAIN,
      railwayPrivateDomain: process.env.RAILWAY_PRIVATE_DOMAIN,
      railwayProjectName: process.env.RAILWAY_PROJECT_NAME,
      railwayEnvironmentName: process.env.RAILWAY_ENVIRONMENT_NAME,
      railwayServiceName: process.env.RAILWAY_SERVICE_NAME,
      railwayProjectId: process.env.RAILWAY_PROJECT_ID,
      railwayEnvironmentId: process.env.RAILWAY_ENVIRONMENT_ID,
      railwayServiceId: process.env.RAILWAY_SERVICE_ID,
    };
  }

  private getRuntimeMeta() {
    return {
      startedAt: SERVICE_STARTED_AT.toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  private getHealthPayload() {
    const build = {
      marker: 'authority-gate-build-check-20260621',
      gitCommit: this.getGitCommit(),
      commitSha: this.getGitCommit(),
      buildTimestamp: this.getBuildTimestamp(),
      appVersion: this.getAppVersion(),
      ...this.getScoringMetadata(),
    };

    return {
      status: 'ok',
      service: 'api',
      timestamp: this.getTimestamp(),
      gitSha: this.getGitCommit() ?? 'unknown',
      commitSha: this.getGitCommit() ?? 'unknown',
      scorerVersion: CX_FIT_SCORER_VERSION,
      resumeProjectEnabled: true,
      build,
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
    const version = this.config.get<string>('APP_VERSION') ?? 'unknown';
    const runtime = this.getRuntimeMeta();
    const build = {
      marker: 'authority-gate-build-check-20260621',
      gitCommit: this.getGitCommit(),
      commitSha: this.getGitCommit(),
      buildTimestamp: this.getBuildTimestamp(),
      appVersion: this.getAppVersion(),
      ...this.getScoringMetadata(),
    };

    return {
      version,
      appVersion: this.getAppVersion(),
      gitSha: this.getGitCommit() ?? 'unknown',
      commitSha: this.getGitCommit() ?? 'unknown',
      scorerVersion: CX_FIT_SCORER_VERSION,
      resumeProjectEnabled: true,
      env: this.config.get<string>('NODE_ENV') ?? 'development',
      port: this.config.get<number>('PORT') ?? 3001,
      startedAt: runtime.startedAt,
      uptimeSeconds: runtime.uptimeSeconds,
      railway: this.getRailwayMeta(),
      timestamp: this.getTimestamp(),
      build,
    };
  }

  @Get('status')
  getStatus() {
    const version = this.config.get<string>('APP_VERSION') ?? 'unknown';
    const runtime = this.getRuntimeMeta();
    const build = {
      marker: 'authority-gate-build-check-20260621',
      gitCommit: this.getGitCommit(),
      commitSha: this.getGitCommit(),
      buildTimestamp: this.getBuildTimestamp(),
      appVersion: this.getAppVersion(),
      ...this.getScoringMetadata(),
    };

    return {
      status: 'ok',
      service: 'api',
      version,
      appVersion: this.getAppVersion(),
      gitSha: this.getGitCommit() ?? 'unknown',
      commitSha: this.getGitCommit() ?? 'unknown',
      scorerVersion: CX_FIT_SCORER_VERSION,
      resumeProjectEnabled: true,
      env: this.config.get<string>('NODE_ENV') ?? 'development',
      port: this.config.get<number>('PORT') ?? 3001,
      startedAt: runtime.startedAt,
      uptimeSeconds: runtime.uptimeSeconds,
      railway: this.getRailwayMeta(),
      timestamp: this.getTimestamp(),
      build,
    };
  }
}
