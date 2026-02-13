import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
import { User } from './users/user.entity';
import { UsersModule } from './users/users.module';
import { AccessCodesModule } from './access-codes/access-codes.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.development.local', '.env.local', '.env'],
    }),
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
    ResumeModule,
    CoverLettersModule,
    EmailModule,
    StarStoriesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
