import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { AdminBypassGuard } from '../admin-users/admin-bypass.guard';
import type { AuthUserDto } from '../auth/dto/auth-response.dto';
import { AccessCodesService } from './access-codes.service';

class CreateAccessCodeDto {
  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}

class UpdateAccessCodeDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  assignedUserId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(255)
  notes?: string | null;
}

@UseGuards(AuthGuard('jwt'), AdminBypassGuard)
@Controller('admin/access-codes')
export class AccessCodesController {
  constructor(private readonly accessCodesService: AccessCodesService) {}

  @Get()
  async list() {
    const rows = await this.accessCodesService.listCodes();
    return rows.map((row) => this.accessCodesService.toAdminListRow(row));
  }

  @Post()
  async create(
    @Body() dto: CreateAccessCodeDto,
    @Req() req: { user?: AuthUserDto },
  ) {
    const createdByUserId = req.user?.userId ?? req.user?.id;
    return this.accessCodesService.generateCode({
      assignedUserId: dto.assignedUserId,
      notes: dto.notes,
      createdByUserId,
    });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateAccessCodeDto) {
    return this.accessCodesService.updateCode(id, {
      assignedUserId: dto.assignedUserId,
      notes: dto.notes,
    });
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Req() req: { user?: AuthUserDto },
  ) {
    const revokedByUserId = req.user?.userId ?? req.user?.id;
    return this.accessCodesService.revokeCode(id, revokedByUserId);
  }
}
