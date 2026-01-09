import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';

import { AccountType } from '../users/account-type.enum';
import { AdminUsersService } from './admin-users.service';
import { AdminBypassGuard } from './admin-bypass.guard';

@UseGuards(AdminBypassGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

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

    if (!Object.values(AccountType).includes(requestedAccountType as AccountType)) {
      throw new BadRequestException('accountType must be "free" or "paid"');
    }

    return this.adminUsersService.updateUserAccountType(
      userId,
      requestedAccountType as AccountType,
    );
  }
}
