import { Transform } from 'class-transformer';
import { IsIn, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES, type AuditAction, type AuditTargetType } from '../audit.actions';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

export class QueryAuditLogsDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsIn(AUDIT_ACTIONS, { message: `action must be one of: ${AUDIT_ACTIONS.join(', ')}` })
  action?: AuditAction;

  @IsOptional()
  @Transform(trim)
  @IsIn(AUDIT_TARGET_TYPES, { message: `targetType must be one of: ${AUDIT_TARGET_TYPES.join(', ')}` })
  targetType?: AuditTargetType;

  @IsOptional()
  @IsUUID('all', { message: 'targetId must be a UUID' })
  targetId?: string;

  @IsOptional()
  @IsUUID('all', { message: 'actorUserId must be a UUID' })
  actorUserId?: string;

  @IsOptional()
  @IsUUID('all', { message: 'institutionId must be a UUID' })
  institutionId?: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'from must be an ISO-8601 date' })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'to must be an ISO-8601 date' })
  to?: string;
}
