import { Controller, Delete, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { AdminBypassGuard } from './admin-bypass.guard';
import { AdminCleanupService } from './admin-cleanup.service';

@UseGuards(AuthGuard('jwt'), AdminBypassGuard)
@Controller('admin/jobs')
export class AdminJobsController {
  constructor(private readonly adminCleanupService: AdminCleanupService) {}

  @Delete(':id')
  deleteJob(@Param('id') jobId: string) {
    return this.adminCleanupService.deleteJob(jobId);
  }
}
