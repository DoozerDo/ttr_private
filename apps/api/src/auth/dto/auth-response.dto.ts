import type { User } from '../../users/user.entity';
import type { Entitlements } from '../../features/feature-gates';

export type AuthUserDto = Omit<User, 'passwordHash'> & {
  id: string;
  userId: string;
  entitlements: Entitlements;
};

export type AuthResponseDto = {
  user: AuthUserDto;
  accessToken: string;
};
