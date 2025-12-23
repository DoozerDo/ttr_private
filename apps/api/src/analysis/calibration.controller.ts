import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { CalibrationDto } from './dto/calibration.dto';
import { AnalysisService } from './analysis.service';

@Controller('calibration')
@UseGuards(AuthGuard('jwt'))
export class CalibrationController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Get()
  async getCalibration(@Req() request: Request & { user?: { id?: string } }) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.analysisService.getCalibration(userId);
  }

  @Post()
  async saveCalibration(
    @Body() body: CalibrationDto,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.analysisService.saveCalibration(userId, body);
  }
}
