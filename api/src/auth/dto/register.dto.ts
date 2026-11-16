import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { IsNewPassword } from './password.rules';

/**
 * SECURITY: there is deliberately NO `role`, `platformRole`, `status` or
 * `institutionId` field here. Combined with global validation running
 * `forbidNonWhitelisted: true`, a request containing any of them is rejected
 * with 400 — not silently ignored. Privilege is assigned server-side only.
 */
export class RegisterDto {
  @IsEmail({}, { message: 'A valid email address is required' })
  @MaxLength(320)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @IsNewPassword()
  password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  fullName!: string;
}
