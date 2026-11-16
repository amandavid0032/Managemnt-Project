import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { InstitutionStatus } from '@prisma/client';

/**
 * Status lives on its own endpoint rather than on UpdateInstitutionDto.
 *
 * `status` must stay off the general PATCH whitelist — the e2e suite asserts
 * that a body carrying it is rejected, because a field editable alongside
 * ordinary content is a field that gets changed by accident. Publishing is a
 * lifecycle decision, so it gets a deliberate route of its own that is easy to
 * audit and will be easy to attach an approval record to later.
 */
export class UpdateInstitutionStatusDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase().replace(/[\s-]+/g, '_') : value,
  )
  @IsEnum(InstitutionStatus, {
    message: `status must be one of: ${Object.values(InstitutionStatus).join(', ')}`,
  })
  status!: InstitutionStatus;

  /**
   * Why. Required when rejecting a submission (PENDING_REVIEW -> DRAFT),
   * optional otherwise. Stored in the audit log, not on the institution.
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3, { message: 'reason must be at least 3 characters' })
  @MaxLength(1000)
  reason?: string;
}
