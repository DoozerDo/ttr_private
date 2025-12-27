import {
  BadRequestException,
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { CoverLettersService } from './cover-letters.service';
import { GenerateCoverLetterDto } from './dto/generate-cover-letter.dto';

@Controller('cover-letters')
@UseGuards(AuthGuard('jwt'))
export class CoverLettersController {
  constructor(private readonly coverLettersService: CoverLettersService) {}

  @Post('generate')
  async generate(
    @Body() body: GenerateCoverLetterDto,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    const placeholderResponse = this.coverLettersService.buildNotImplementedResponse(
      userId,
      body,
    );

    throw new HttpException(placeholderResponse, HttpStatus.NOT_IMPLEMENTED);
  }
}
