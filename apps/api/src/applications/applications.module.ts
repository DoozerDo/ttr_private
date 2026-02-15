import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComplianceModule } from '../compliance/compliance.module';
import { Application } from './application.entity';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';

@Module({
  imports: [TypeOrmModule.forFeature([Application]), ComplianceModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
  exports: [TypeOrmModule, ApplicationsService],
})
export class ApplicationsModule {}
