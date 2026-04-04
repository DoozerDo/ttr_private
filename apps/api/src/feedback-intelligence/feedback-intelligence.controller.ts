import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsBoolean, IsEnum, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AdminBypassGuard } from '../admin-users/admin-bypass.guard';
import type { AuthUserDto } from '../auth/dto/auth-response.dto';
import { FeedbackCategory, FeedbackSeverity, FeedbackTriageStatus } from './feedback-item.entity';
import { FeedbackIntelligenceService } from './feedback-intelligence.service';
import { FrictionEventType, FrictionResolutionStatus } from './friction-event.entity';

class CreateFeedbackDto {
  @IsEnum(FeedbackCategory)
  category!: FeedbackCategory;
  @IsString()
  @MaxLength(255)
  title!: string;
  @IsString()
  message!: string;
  @IsOptional()
  @IsString()
  pageContext?: string | null;
  @IsOptional()
  @IsUUID()
  analysisId?: string | null;
  @IsOptional()
  @IsUUID()
  baselineId?: string | null;
  @IsOptional()
  @IsUUID()
  opportunityId?: string | null;
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

class UpdateFeedbackDto {
  @IsOptional() @IsEnum(FeedbackTriageStatus) triageStatus?: FeedbackTriageStatus;
  @IsOptional() @IsEnum(FeedbackSeverity) severity?: FeedbackSeverity;
  @IsOptional() @IsString() adminNotes?: string | null;
  @IsOptional() @IsBoolean() requiresFounderFollowup?: boolean;
  @IsOptional() @IsString() linkedIssueKey?: string | null;
}

class UpdateFrictionDto {
  @IsOptional() @IsEnum(FrictionResolutionStatus) resolutionStatus?: FrictionResolutionStatus;
  @IsOptional() @IsEnum(FeedbackSeverity) severity?: FeedbackSeverity;
  @IsOptional() @IsString() adminNotes?: string | null;
  @IsOptional() @IsBoolean() requiresFounderFollowup?: boolean;
  @IsOptional() @IsString() linkedIssueKey?: string | null;
}

@Controller()
export class FeedbackIntelligenceController {
  constructor(private readonly service: FeedbackIntelligenceService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('feedback')
  async createFeedback(
    @Body(new ValidationPipe({ whitelist: true, transform: true })) payload: CreateFeedbackDto,
    @Req() request: { user: AuthUserDto },
  ) {
    return this.service.createFeedback({
      userId: request.user.id,
      ...payload,
    });
  }

  @UseGuards(AuthGuard('jwt'), AdminBypassGuard)
  @Get('admin/feedback')
  async listFeedback(
    @Query('triageStatus') triageStatus?: FeedbackTriageStatus,
    @Query('severity') severity?: FeedbackSeverity,
    @Query('category') category?: FeedbackCategory,
    @Query('pageContext') pageContext?: string,
    @Query('unresolvedOnly') unresolvedOnly?: string,
  ) {
    return this.service.listFeedback({
      triageStatus,
      severity,
      category,
      pageContext,
      unresolvedOnly: unresolvedOnly === 'true',
    });
  }

  @UseGuards(AuthGuard('jwt'), AdminBypassGuard)
  @Patch('admin/feedback/:id')
  async updateFeedback(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) payload: UpdateFeedbackDto,
  ) {
    return this.service.updateFeedback(id, payload);
  }

  @UseGuards(AuthGuard('jwt'), AdminBypassGuard)
  @Get('admin/friction-events')
  async listFrictionEvents(
    @Query('resolutionStatus') resolutionStatus?: FrictionResolutionStatus,
    @Query('severity') severity?: FeedbackSeverity,
    @Query('eventType') eventType?: FrictionEventType,
    @Query('unresolvedOnly') unresolvedOnly?: string,
  ) {
    return this.service.listFrictionEvents({
      resolutionStatus,
      severity,
      eventType,
      unresolvedOnly: unresolvedOnly === 'true',
    });
  }

  @UseGuards(AuthGuard('jwt'), AdminBypassGuard)
  @Patch('admin/friction-events/:id')
  async updateFriction(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) payload: UpdateFrictionDto,
  ) {
    return this.service.updateFrictionEvent(id, payload);
  }

  @UseGuards(AuthGuard('jwt'), AdminBypassGuard)
  @Get('admin/friction-patterns')
  async listFrictionPatterns() {
    return this.service.getFrictionPatterns();
  }

  @UseGuards(AuthGuard('jwt'), AdminBypassGuard)
  @Post('admin/friction-events/run-detection')
  async runDetection() {
    return this.service.runFrictionDetection();
  }
}
