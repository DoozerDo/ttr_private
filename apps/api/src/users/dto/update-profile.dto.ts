import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  roleTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  intendedUse?: string;

  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true })
  @MaxLength(255)
  linkedinUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  studioResumeFocusDefault?: string;
}
