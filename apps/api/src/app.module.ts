import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
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
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url:
          configService.get<string>('DATABASE_URL') ??
          'postgresql://postgres:postgres@db:5432/targetthisrole',
        entities: [User],
        synchronize:
          configService.get<string>('TYPEORM_SYNCHRONIZE') === 'true',
        autoLoadEntities: true,
      }),
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
  ],
  controllers: [AppController],
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
