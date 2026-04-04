import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { AccountType } from '../users/account-type.enum';
import { AdminCleanupService } from './admin-cleanup.service';
import { AdminBypassGuard } from './admin-bypass.guard';
import { AdminUsersService } from './admin-users.service';

@UseGuards(AuthGuard('jwt'), AdminBypassGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly adminUsersService: AdminUsersService,
    private readonly adminCleanupService: AdminCleanupService,
  ) {}

  @Get()
  listUsers() {
    return this.adminUsersService.listUsers();
  }

  @Patch(':id')
  async updateAccountType(
    @Param('id') userId: string,
    @Body() body: { accountType?: string },
  ) {
    const requestedAccountType = (body.accountType ?? '').toLowerCase().trim();

    if (
      !Object.values(AccountType).includes(requestedAccountType as AccountType)
    ) {
      throw new BadRequestException('accountType must be "free" or "paid"');
    }

    return this.adminUsersService.updateUserAccountType(
      userId,
      requestedAccountType as AccountType,
    );
  }

  @Delete(':id')
  deleteUser(@Param('id') userId: string) {
    return this.adminCleanupService.deleteUser(userId);
  }
}
