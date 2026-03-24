import { GUARDS_METADATA, MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AdminSignalController } from './admin-signal.controller';
import { AdminSignalModule } from './admin-signal.module';
import { AdminUsersModule } from '../admin-users/admin-users.module';
import { AdminBypassGuard } from '../admin-users/admin-bypass.guard';
import { AdminUsersService } from '../admin-users/admin-users.service';

describe('AdminSignalModule wiring', () => {
  it('imports AdminUsersModule so AdminBypassGuard can resolve AdminUsersService in this context', () => {
    const imports =
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, AdminSignalModule) ?? [];

    expect(imports).toContain(AdminUsersModule);
  });

  it('uses AdminBypassGuard on AdminSignalController routes', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AdminSignalController) ?? [];

    expect(guards).toContain(AdminBypassGuard);
  });

  it('resolves AdminBypassGuard when AdminUsersService is provided by canonical module export', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminBypassGuard,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: AdminUsersService,
          useValue: {
            isAdmin: jest.fn(),
          },
        },
      ],
    }).compile();

    expect(moduleRef.get(AdminBypassGuard)).toBeInstanceOf(AdminBypassGuard);
  });

  it('keeps AdminUsersService single-owned in AdminUsersModule', () => {
    const adminUsersProviders =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AdminUsersModule) ?? [];
    const adminSignalProviders =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AdminSignalModule) ?? [];

    const adminUsersServiceProviders = adminUsersProviders.filter(
      (provider: unknown) => provider === AdminUsersService,
    );

    expect(adminUsersServiceProviders).toHaveLength(1);
    expect(adminSignalProviders).not.toContain(AdminUsersService);
    expect(adminSignalProviders).not.toContain(AdminBypassGuard);
  });
});
