import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { InstitutionCategory, InstitutionStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export const SORTABLE_FIELDS = ['name', 'createdAt', 'updatedAt'] as const;
export type SortableField = (typeof SORTABLE_FIELDS)[number];

/** Normalises free-form casing to the canonical enum value. */
const toEnumCase = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase().replace(/[\s-]+/g, '_') : value;

export class QueryInstitutionsDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  /**
   * Accepts "school", "School", "SCHOOL" and "training center" — all resolve
   * to the canonical enum. The API is not capitalisation-dependent.
   */
  @IsOptional()
  @Transform(toEnumCase)
  @IsEnum(InstitutionCategory, {
    message: `category must be one of: ${Object.values(InstitutionCategory).join(', ')}`,
  })
  category?: InstitutionCategory;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Length(2, 2, { message: 'countryCode must be a 2-letter ISO-3166-1 alpha-2 code' })
  countryCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  city?: string;

  /**
   * Only platform staff may filter by status; for everyone else the service
   * forces PUBLISHED. Enforced in the service, not here — a DTO cannot know
   * who is calling.
   */
  @IsOptional()
  @Transform(toEnumCase)
  @IsEnum(InstitutionStatus)
  status?: InstitutionStatus;

  @IsOptional()
  @IsIn(SORTABLE_FIELDS, { message: `sortBy must be one of: ${SORTABLE_FIELDS.join(', ')}` })
  sortBy: SortableField = 'name';

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsIn(['asc', 'desc'], { message: 'sortOrder must be asc or desc' })
  sortOrder: 'asc' | 'desc' = 'asc';
}
