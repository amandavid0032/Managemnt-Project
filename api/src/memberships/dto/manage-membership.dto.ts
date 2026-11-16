import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { MembershipRole, MembershipStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

const toEnumCase = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase().replace(/[\s-]+/g, '_') : value;

/** Filters for the member list. All optional, so existing callers are unaffected. */
export class QueryMembershipsDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(toEnumCase)
  @IsEnum(MembershipRole, {
    message: `role must be one of: ${Object.values(MembershipRole).join(', ')}`,
  })
  role?: MembershipRole;

  @IsOptional()
  @Transform(toEnumCase)
  @IsEnum(MembershipStatus, {
    message: `status must be one of: ${Object.values(MembershipStatus).join(', ')}`,
  })
  status?: MembershipStatus;

  /** Matched against the member's name, email and institution member id. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;
}

/**
 * Exact-address lookup, deliberately NOT a search.
 *
 * A fuzzy "find users" box would let any school administrator page through
 * every account on the platform and harvest names and emails. Requiring the
 * full address means you can only find someone whose address you already
 * know — which is exactly the situation of enrolling a person who gave it
 * to you.
 */
export class LookupMemberDto {
  @IsEmail({}, { message: 'Enter the full email address of the person to add' })
  @MaxLength(320)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;
}

/**
 * Corrections to an existing membership. Status changes have their own
 * endpoint so that ending someone's membership is never a side effect of
 * fixing a typo in their roll number.
 */
export class UpdateMembershipDto {
  @IsOptional()
  @Transform(toEnumCase)
  @IsEnum(MembershipRole, {
    message: `role must be one of: ${Object.values(MembershipRole).join(', ')}`,
  })
  role?: MembershipRole;

  /** Null clears it. */
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  })
  institutionMemberId?: string | null;
}

/**
 * The statuses an institution administrator decides.
 *
 *  ACTIVE    — reinstate a suspended member
 *  SUSPENDED — temporarily remove access; the link is kept
 *  LEFT      — end the membership. Permanent: the row stays as education
 *              history with left_at set. Re-enrolment is a new membership.
 *
 * PENDING and REJECTED belong to a join-request flow that does not exist yet.
 */
export const MANAGEABLE_MEMBERSHIP_STATUSES = [
  MembershipStatus.ACTIVE,
  MembershipStatus.SUSPENDED,
  MembershipStatus.LEFT,
] as const;

export class UpdateMembershipStatusDto {
  @Transform(toEnumCase)
  @IsIn(MANAGEABLE_MEMBERSHIP_STATUSES, {
    message: `status must be one of: ${MANAGEABLE_MEMBERSHIP_STATUSES.join(', ')}`,
  })
  status!: (typeof MANAGEABLE_MEMBERSHIP_STATUSES)[number];
}
