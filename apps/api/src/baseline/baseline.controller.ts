import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Express } from 'express';
import { BaselineService } from './baseline.service';

@Controller('baselines')
@UseGuards(AuthGuard('jwt'))
export class BaselineController {
  constructor(private readonly baselineService: BaselineService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async uploadBaseline(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    const sections = await this.baselineService.buildSectionsFromFile(file);

    const baseline = await this.baselineService.createBaseline(
      userId,
      {
        originalname: file.originalname,
        mimetype: file.mimetype,
        path: file.path,
      },
      sections,
    );

    return baseline;
  }

  @Get()
  async listBaselines(@Req() request: Request & { user?: { id?: string } }) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.baselineService.listBaselinesForUser(userId);
  }

  @Get(':id')
  async getBaseline(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.baselineService.getBaselineByIdForUser(id, userId);
  }
}
