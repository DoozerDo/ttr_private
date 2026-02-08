import { Controller, Delete, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { AdminBypassGuard } from './admin-bypass.guard';
import { AdminCleanupService } from './admin-cleanup.service';

@UseGuards(AuthGuard('jwt'), AdminBypassGuard)
@Controller('admin/jobs')
export class AdminJobsController {
  constructor(private readonly adminCleanupService: AdminCleanupService) {}

  @Get()
  listJobs(@Query('includeArchived') includeArchived?: string) {
    return this.adminCleanupService.listJobs(includeArchived === 'true');
  }

  @Delete(':id')
  deleteJob(@Param('id') jobId: string) {
    return this.adminCleanupService.deleteJob(jobId);
  }
}
