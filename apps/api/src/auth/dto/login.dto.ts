import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}


export class RedeemAccessCodeAndLoginDto extends LoginDto {
  @IsString()
  @MinLength(8)
  code!: string;
}
