import { Transform } from 'class-transformer';
import { IsEnum, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { ProfileVisibility } from '@prisma/client';

/**
 * Trims, and turns a blank string into null so "clear this field" has one
 * representation. The database CHECK constraints refuse blank strings too.
 */
const trimToNull = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

/** Present-and-not-null means "set it"; null means "clear it"; absent means "leave it". */
const unlessNullOrAbsent = (_: unknown, value: unknown) => value !== null && value !== undefined;

/**
 * Everything a person may change about how they appear.
 *
 * SECURITY: no email, status, role or visibility here. Email changes need a
 * re-verification flow of their own; visibility has its own endpoint so that
 * publishing a profile is always a deliberate act, never a side effect of
 * saving a bio. forbidNonWhitelisted turns any such field into a 400.
 */
export class UpdateProfileDto {
  /** Lives on `users` — it is also how institutions see the person. Cannot be cleared. */
  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'fullName must be text' })
  @MinLength(2, { message: 'fullName must be at least 2 characters' })
  @MaxLength(200, { message: 'fullName must be at most 200 characters' })
  fullName?: string;

  @ValidateIf(unlessNullOrAbsent)
  @Transform(trimToNull)
  @IsString()
  @MaxLength(160, { message: 'headline must be at most 160 characters' })
  headline?: string | null;

  @ValidateIf(unlessNullOrAbsent)
  @Transform(trimToNull)
  @IsString()
  @MaxLength(2000, { message: 'bio must be at most 2000 characters' })
  bio?: string | null;

  @ValidateIf(unlessNullOrAbsent)
  @Transform(trimToNull)
  @IsString()
  @MaxLength(120, { message: 'location must be at most 120 characters' })
  location?: string | null;
}

export class UpdateVisibilityDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsEnum(ProfileVisibility, {
    message: `visibility must be one of: ${Object.values(ProfileVisibility).join(', ')}`,
  })
  visibility!: ProfileVisibility;
}
