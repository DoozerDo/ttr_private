import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { AuthUserDto } from '../auth/dto/auth-response.dto';
import { BetaFeedbackService } from './beta-feedback.service';
import { CreateBetaFeedbackDto } from './dto/create-beta-feedback.dto';
import { ListBetaFeedbackDto } from './dto/list-beta-feedback.dto';

type BetaFeedbackRequest = {
  user: AuthUserDto;
};

@Controller('beta-feedback')
export class BetaFeedbackController {
  constructor(private readonly betaFeedbackService: BetaFeedbackService) {}

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async create(@Body() payload: CreateBetaFeedbackDto, @Req() request: BetaFeedbackRequest) {
    if (request.user.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return this.betaFeedbackService.create(payload, request.user);
  }

  @Get()
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async findAll(@Query() filters: ListBetaFeedbackDto, @Req() request: BetaFeedbackRequest) {
    if (request.user.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return this.betaFeedbackService.findAll(filters);
  }

  @Get('summary')
  async getSummary(@Req() request: BetaFeedbackRequest) {
    if (request.user.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return this.betaFeedbackService.getSummary();
  }
}

