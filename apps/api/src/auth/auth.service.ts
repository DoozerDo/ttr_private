import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { User } from '../users/user.entity';
import { getEntitlementsForTier } from '../features/feature-gates';
import type { AuthResponseDto } from './dto/auth-response.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(payload: RegisterDto): Promise<AuthResponseDto> {
    const existing = await this.usersService.findByEmail(payload.email);

    if (existing) {
      throw new BadRequestException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(payload.password, 10);
    const user = await this.usersService.create(payload.email, passwordHash);

    return this.buildAuthResponse(user);
  }

  async login(payload: LoginDto): Promise<AuthResponseDto> {
    const user = await this.usersService.findByEmail(payload.email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValidPassword = await bcrypt.compare(
      payload.password,
      user.passwordHash,
    );

    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildAuthResponse(user);
  }

  private buildAuthResponse(user: User): AuthResponseDto {
    const entitlements = getEntitlementsForTier(user.subscriptionTier);

    const payload = {
      sub: user.id,
      email: user.email,
      subscriptionTier: user.subscriptionTier,
      entitlements,
    };

    const accessToken = this.jwtService.sign(payload);

    const { passwordHash, ...sanitizedUser } = user;

    return {
      accessToken,
      user: { ...sanitizedUser, entitlements },
    };
  }
}
