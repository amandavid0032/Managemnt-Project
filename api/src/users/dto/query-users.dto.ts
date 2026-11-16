import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { MembershipRole, PlatformRole, UserStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export const USER_SORTABLE_FIELDS = ['createdAt', 'lastLoginAt', 'email', 'fullName'] as const;
export type UserSortableField = (typeof USER_SORTABLE_FIELDS)[number];

const toEnumCase = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase().replace(/[\s-]+/g, '_') : value;

export class QueryUsersDto extends PaginationQueryDto {
  /** Matched against email and full name. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  @IsOptional()
  @Transform(toEnumCase)
  @IsEnum(PlatformRole, {
    message: `platformRole must be one of: ${Object.values(PlatformRole).join(', ')}`,
  })
  platformRole?: PlatformRole;

  @IsOptional()
  @Transform(toEnumCase)
  @IsEnum(UserStatus, {
    message: `status must be one of: ${Object.values(UserStatus).join(', ')}`,
  })
  status?: UserStatus;

  /** People holding this role in an ACTIVE membership at a live institution. */
  @IsOptional()
  @Transform(toEnumCase)
  @IsEnum(MembershipRole, {
    message: `membershipRole must be one of: ${Object.values(MembershipRole).join(', ')}`,
  })
  membershipRole?: MembershipRole;

  /** true = address verified, false = not yet. */
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean({ message: 'emailVerified must be true or false' })
  emailVerified?: boolean;

  @IsOptional()
  @IsIn(USER_SORTABLE_FIELDS, {
    message: `sortBy must be one of: ${USER_SORTABLE_FIELDS.join(', ')}`,
  })
  sortBy: UserSortableField = 'createdAt';

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsIn(['asc', 'desc'], { message: 'sortOrder must be asc or desc' })
  sortOrder: 'asc' | 'desc' = 'desc';
}
