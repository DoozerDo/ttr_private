import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DataType, newDb } from 'pg-mem';
import { randomUUID } from 'node:crypto';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AdminUsersModule } from './admin-users/admin-users.module';
import { AuthModule } from './auth/auth.module';
import { AnalysisModule } from './analysis/analysis.module';
import { ApplicationsModule } from './applications/applications.module';
import { BaselineModule } from './baseline/baseline.module';
import { ComplianceModule } from './compliance/compliance.module';
import { InterviewsModule } from './interviews/interviews.module';
import { JobsModule } from './jobs/jobs.module';
import { CoverLettersModule } from './cover-letters/cover-letters.module';
import { EmailModule } from './email/email.module';
import { RealityCheckModule } from './reality-check/reality-check.module';
import { ResumeModule } from './resume/resume.module';
import { StarStoriesModule } from './star-stories/star-stories.module';
import { JobTrackerModule } from './job-tracker/job-tracker.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { StudioArtifactsModule } from './studio-artifacts/studio-artifacts.module';
import { User } from './users/user.entity';
import { UsersModule } from './users/users.module';
import { AccessCodesModule } from './access-codes/access-codes.module';
import { AccessGuard } from './auth/guards/access.guard';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { AnalyticsModule } from './analytics/analytics.module';
import { PreviewModule } from './preview/preview.module';
import { SupportModule } from './support/support.module';
import { BetaFeedbackModule } from './beta-feedback/beta-feedback.module';
import { AdminEngagementModule } from './admin-engagement/admin-engagement.module';
import { FeedbackIntelligenceModule } from './feedback-intelligence/feedback-intelligence.module';
import { AdminFunnelModule } from './admin-funnel/admin-funnel.module';
import { AdminSignalModule } from './admin-signal/admin-signal.module';
import { SyntheticModule } from './synthetic/synthetic.module';
import { BugReportsModule } from './bug-reports/bug-reports.module';
import { BetaOpsController } from './ops/beta-ops.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.development.local', '.env.local', '.env'],
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      dataSourceFactory: async (options) => {
        const shouldUseTestDb =
          process.env.USE_PGMEM_DB === 'true' || process.env.NODE_ENV === 'test';

        if (shouldUseTestDb) {
          const db = newDb({ autoCreateForeignKeyIndices: true });
          db.public.registerFunction({
            name: 'version',
            returns: 'text' as any,
            implementation: () => 'PostgreSQL 16.0',
          });
          db.public.registerFunction({
            name: 'current_database',
            returns: 'text' as any,
            implementation: () => 'test',
          });
          db.public.registerFunction({
            name: 'current_schema',
            returns: 'text' as any,
            implementation: () => 'public',
          });
          db.public.registerFunction({
            name: 'length',
            args: [db.public.getType(DataType.text)],
            returns: 'int4' as any,
            implementation: (value: string) => value.length,
          });
          db.public.registerFunction({
            name: 'uuid_generate_v4',
            returns: 'uuid' as any,
            impure: true,
            implementation: () => randomUUID(),
          });
          db.public.registerFunction({
            name: 'gen_random_uuid',
            returns: 'uuid' as any,
            impure: true,
            implementation: () => randomUUID(),
          });
          db.public.registerEquivalentSizableType({
            name: 'vector',
            equivalentTo: db.public.getType(DataType.text),
            isValid: () => true,
          });
          const dataSource = db.adapters.createTypeormDataSource({
            ...(options ?? {}),
            type: 'postgres',
          } as any);
          return dataSource;
        }

        return new DataSource(options as any);
      },
      useFactory: (configService: ConfigService) => {
        const nodeEnv =
          process.env.NODE_ENV ?? configService.get<string>('NODE_ENV') ?? 'development';
        const isProd = nodeEnv === 'production';
        const useTestDatabase = process.env.USE_PGMEM_DB === 'true' || nodeEnv === 'test';
        const rawDatabaseUrl =
          configService.get<string>('DATABASE_URL') ?? process.env.DATABASE_URL ?? '';
        const databaseUrl = typeof rawDatabaseUrl === 'string' ? rawDatabaseUrl.trim() : '';

        if (isProd && !databaseUrl) {
          throw new Error(
            'DATABASE_URL is required for production startup.',
          );
        }

        if (useTestDatabase) {
          return {
            type: 'postgres',
            entities: [User],
            synchronize: true,
            autoLoadEntities: true,
          };
        }

        return {
          type: 'postgres',
          url: isProd ? databaseUrl : databaseUrl || 'postgresql://postgres:postgres@db:5432/targetthisrole',
          entities: [User],
          synchronize:
            configService.get<string>('TYPEORM_SYNCHRONIZE') === 'true',
          autoLoadEntities: true,
        };
      },
    }),
    AdminUsersModule,
    AccessCodesModule,
    UsersModule,
    AuthModule,
    AnalysisModule,
    RealityCheckModule,
    ApplicationsModule,
    BaselineModule,
    ComplianceModule,
    InterviewsModule,
    JobsModule,
    JobTrackerModule,
    OpportunitiesModule,
    ResumeModule,
    CoverLettersModule,
    StudioArtifactsModule,
    EmailModule,
    StarStoriesModule,
    AnalyticsModule,
    PreviewModule,
    SupportModule,
    BetaFeedbackModule,
    AdminEngagementModule,
    FeedbackIntelligenceModule,
    AdminFunnelModule,
    AdminSignalModule,
    SyntheticModule,
    BugReportsModule,
  ],
  controllers: [AppController, BetaOpsController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AccessGuard,
    },
  ],
})
export class AppModule {}
