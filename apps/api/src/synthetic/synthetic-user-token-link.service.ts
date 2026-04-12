import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { UserToken, type UserTokenType } from '../auth/user-token.entity';
import { UsersService } from '../users/users.service';
import { buildAbsoluteUrl, resolvePublicWebBaseUrl } from '../auth/confirm-url';

export type SyntheticUserTokenLinkResponse = {
  email: string;
  tokenType: UserTokenType;
  url: string;
  expiresAt: string;
};

@Injectable()
export class SyntheticUserTokenLinkService {
  private readonly publicWebBaseUrl: string;

  constructor(
    @InjectRepository(UserToken)
    private readonly userTokensRepository: Repository<UserToken>,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {
    this.publicWebBaseUrl = resolvePublicWebBaseUrl({
      nodeEnv: this.configService.get<string>('NODE_ENV'),
      appPublicWebUrl: this.configService.get<string>('APP_PUBLIC_WEB_URL'),
    });
  }

  async getUserTokenLink(
    email: string,
    tokenType: UserTokenType | string,
  ): Promise<SyntheticUserTokenLinkResponse> {
    const normalizedEmail = email?.trim().toLowerCase() ?? '';
    if (!normalizedEmail) {
      throw new BadRequestException('email is required');
    }

    if (tokenType !== 'confirm' && tokenType !== 'reset-password') {
      throw new BadRequestException('type must be confirm or reset-password');
    }

    const user = await this.usersService.findByEmail(normalizedEmail);
    if (!user) {
      throw new NotFoundException(`No user found for ${normalizedEmail}`);
    }

    const token = await this.userTokensRepository.findOne({
      where: { userId: user.id, type: tokenType },
      order: { createdAt: 'DESC' },
    });

    if (!token) {
      throw new NotFoundException(`No ${tokenType} token found for ${normalizedEmail}`);
    }

    if (token.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException(`The ${tokenType} token for ${normalizedEmail} is expired`);
    }

    const path = tokenType === 'confirm' ? '/auth/confirm' : '/auth/reset-password';
    return {
      email: normalizedEmail,
      tokenType,
      url: buildAbsoluteUrl({
        baseUrl: this.publicWebBaseUrl,
        path,
        query: { token: token.token },
      }),
      expiresAt: token.expiresAt.toISOString(),
    };
  }
}

