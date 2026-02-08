import { Controller, Delete, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { AdminBypassGuard } from './admin-bypass.guard';
import { AdminCleanupService } from './admin-cleanup.service';

@UseGuards(AuthGuard('jwt'), AdminBypassGuard)
@Controller('admin/baselines')
export class AdminBaselinesController {
  constructor(private readonly adminCleanupService: AdminCleanupService) {}

  @Delete(':id')
  deleteBaseline(@Param('id') baselineId: string) {
    return this.adminCleanupService.deleteBaseline(baselineId);
  }
}
