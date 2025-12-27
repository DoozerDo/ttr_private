import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
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

    return this.coverLettersService.generateCoverLetter(userId, body);
  }

  @Get()
  async list(@Req() request: Request & { user?: { id?: string } }) {
    const userId = request.user?.id;
    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.coverLettersService.listCoverLetters(userId);
  }

  @Get(':id')
  async getOne(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;
    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.coverLettersService.getCoverLetter(userId, id);
  }

  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;
    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.coverLettersService.deleteCoverLetter(userId, id);
  }
}
