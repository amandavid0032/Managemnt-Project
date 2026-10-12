import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';
import { InstitutionCategory } from '@prisma/client';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const toEnumCase = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase().replace(/[\s-]+/g, '_') : value;

/**
 * Every field optional — PATCH semantics.
 *
 * Written out rather than derived with `PartialType`: @nestjs/mapped-types is
 * ESM-only and uses `import.meta.url`, which cannot be transpiled for the
 * CommonJS test runner. Dropping it removed a dependency and a Jest workaround.
 *
 * KEEP IN SYNC with CreateInstitutionDto. The invariant that matters is the
 * whitelist itself: `status`, `source`, `slug`, `verifiedAt` and
 * `createdByUserId` are server-owned and must never appear here.
 * The e2e suite asserts each one is rejected.
 */
export class UpdateInstitutionDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(300) @Transform(trim)
  name?: string;

  @IsOptional() @IsString() @MaxLength(300) @Transform(trim)
  legalName?: string;

  @IsOptional()
  @Transform(toEnumCase)
  @IsEnum(InstitutionCategory, {
    message: `category must be one of: ${Object.values(InstitutionCategory).join(', ')}`,
  })
  category?: InstitutionCategory;

  @IsOptional() @IsString() @MaxLength(120) @Transform(trim)
  typeLabel?: string;

  @IsOptional() @IsString() @MaxLength(10000) @Transform(trim)
  description?: string;

  @IsOptional() @IsEmail() @MaxLength(320)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email?: string;

  @IsOptional() @IsString() @MaxLength(50) @Transform(trim)
  phone?: string;

  @IsOptional() @IsUrl({ require_protocol: true }) @MaxLength(500) @Transform(trim)
  website?: string;

  @IsOptional() @IsString() @MaxLength(300) @Transform(trim)
  addressLine1?: string;

  @IsOptional() @IsString() @MaxLength(300) @Transform(trim)
  addressLine2?: string;

  @IsOptional() @IsString() @MaxLength(150) @Transform(trim)
  city?: string;

  @IsOptional() @IsString() @MaxLength(150) @Transform(trim)
  state?: string;

  @IsOptional() @IsString() @MaxLength(30) @Transform(trim)
  postalCode?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Length(2, 2, { message: 'countryCode must be a 2-letter ISO-3166-1 alpha-2 code' })
  countryCode?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null ? undefined : Number(value)))
  @IsLatitude({ message: 'latitude must be between -90 and 90' })
  latitude?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null ? undefined : Number(value)))
  @IsLongitude({ message: 'longitude must be between -180 and 180' })
  longitude?: number;
}
