import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { MembershipRole } from '@prisma/client';

/**
 * SECURITY: there is deliberately NO `institutionId` field.
 *
 * The institution is taken from the route parameter and validated by
 * TenantGuard against an ACTIVE membership. Because global validation runs
 * `forbidNonWhitelisted: true`, a body containing institutionId is rejected
 * with 400 rather than silently ignored — a client cannot redirect a write
 * at another tenant.
 */
export class CreateMembershipDto {
  // 'all', not '4': EduHub ids are UUIDv7 (time-ordered, so B-tree indexes
  // do not fragment). Pinning to v4 here rejected every real id.
  @IsUUID('all', { message: 'userId must be a valid UUID' })
  userId!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase().replace(/[\s-]+/g, '_') : value,
  )
  @IsEnum(MembershipRole, {
    message: `role must be one of: ${Object.values(MembershipRole).join(', ')}`,
  })
  role!: MembershipRole;

  /** Institution-issued identifier (roll number, staff ID). Never a credential. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  institutionMemberId?: string;
}
