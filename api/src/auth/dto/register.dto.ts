import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

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

  @IsString()
  @MinLength(12, { message: 'Password must be at least 12 characters' })
  @MaxLength(128, { message: 'Password must be at most 128 characters' })
  @Matches(/[a-z]/, { message: 'Password must contain a lowercase letter' })
  @Matches(/[A-Z]/, { message: 'Password must contain an uppercase letter' })
  @Matches(/[0-9]/, { message: 'Password must contain a digit' })
  password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  fullName!: string;
}
