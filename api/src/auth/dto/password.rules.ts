import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * The one definition of an acceptable new password, shared by registration
 * and password reset so the two can never drift apart.
 *
 * 128 is a ceiling, not a target: Argon2 cost is fixed, but an unbounded
 * input is still a cheap way to make the server hash megabytes.
 */
export const IsNewPassword = () =>
  applyDecorators(
    IsString(),
    MinLength(12, { message: 'Password must be at least 12 characters' }),
    MaxLength(128, { message: 'Password must be at most 128 characters' }),
    Matches(/[a-z]/, { message: 'Password must contain a lowercase letter' }),
    Matches(/[A-Z]/, { message: 'Password must contain an uppercase letter' }),
    Matches(/[0-9]/, { message: 'Password must contain a digit' }),
  );
