import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { IsNewPassword } from './password.rules';

const trimLower = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** 32 random bytes base64url-encoded are 43 chars; anything far off is junk. */
const TOKEN_MIN = 20;
const TOKEN_MAX = 128;

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'A valid email address is required' })
  @MaxLength(320)
  @Transform(trimLower)
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(TOKEN_MIN, { message: 'This link is invalid or has expired' })
  @MaxLength(TOKEN_MAX, { message: 'This link is invalid or has expired' })
  token!: string;

  @IsNewPassword()
  password!: string;
}

export class VerifyEmailDto {
  @IsString()
  @MinLength(TOKEN_MIN, { message: 'This link is invalid or has expired' })
  @MaxLength(TOKEN_MAX, { message: 'This link is invalid or has expired' })
  token!: string;
}
