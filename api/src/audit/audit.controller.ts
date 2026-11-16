import { Controller, Get, Query } from '@nestjs/common';
import { PlatformRole } from '@prisma/client';
import { PlatformRoles } from '../common/decorators/platform-roles.decorator';
import { AuditService } from './audit.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

/**
 * Read-only. There is no route that edits or deletes an entry, and the
 * database trigger would refuse one if there were.
 */
@PlatformRoles(PlatformRole.PLATFORM_ADMIN, PlatformRole.SUPER_ADMIN)
@Controller({ path: 'admin/audit-logs', version: '1' })
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query() query: QueryAuditLogsDto) {
    return this.audit.list(query);
  }
}
