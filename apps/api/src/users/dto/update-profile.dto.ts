import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @MaxLength(150)
  roleTitle!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  company?: string;

  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true })
  @MaxLength(255)
  linkedinUrl?: string;

  @IsString()
  @MaxLength(255)
  intendedUse!: string;
}
