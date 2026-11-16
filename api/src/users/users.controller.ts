import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { PlatformRole } from '@prisma/client';
import { PlatformRoles } from '../common/decorators/platform-roles.decorator';
import { type Actor, CurrentActor } from '../common/decorators/actor.decorator';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdatePlatformRoleDto } from './dto/update-platform-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UsersService } from './users.service';

/**
 * Platform user administration. Every route here is staff-only.
 *
 * @PlatformRoles is declared on the CLASS, so a route added later is
 * restricted by default — the opposite of having to remember the decorator.
 *
 * Platform roles change only through PATCH :id/platform-role, which is
 * SUPER_ADMIN-only and cannot touch SUPER_ADMIN itself.
 *
 * There is intentionally no POST (staff do not create accounts on someone's
 * behalf; people register themselves), no DELETE (deleting a user would
 * cascade their memberships away and destroy audit history — suspension is
 * the reversible, auditable action) and no platformRole mutation.
 */
@PlatformRoles(PlatformRole.PLATFORM_ADMIN, PlatformRole.SUPER_ADMIN)
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Declared before ':id' so the literal path is not swallowed as an id. */
  @Get('stats')
  stats() {
    return this.users.stats();
  }

  @Get()
  findMany(@Query() query: QueryUsersDto) {
    return this.users.findMany(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.findOne(id);
  }

  @Patch(':id/status')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.users.changeStatus(id, dto, actor);
  }

  /** Method-level metadata overrides the class: super admins only. */
  @PlatformRoles(PlatformRole.SUPER_ADMIN)
  @Patch(':id/platform-role')
  changePlatformRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlatformRoleDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.users.changePlatformRole(id, dto, actor);
  }
}
