import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { PlatformRole } from '@prisma/client';
import type { Request } from 'express';
import { PlatformRoles } from '../common/decorators/platform-roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/tenant.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { CreateInstitutionDto } from './dto/create-institution.dto';
import { QueryInstitutionsDto } from './dto/query-institutions.dto';
import { UpdateInstitutionDto } from './dto/update-institution.dto';
import { InstitutionsService } from './institutions.service';

@Controller({ path: 'institutions', version: '1' })
export class InstitutionsController {
  constructor(private readonly institutions: InstitutionsService) {}

  /**
   * Public discovery endpoint.
   * Marked @Public but still reads the optional user, because platform staff
   * see unpublished records while anonymous callers do not.
   */
  @Public()
  @Get()
  findMany(@Query() query: QueryInstitutionsDto, @Req() req: Request & { user?: AuthUser }) {
    return this.institutions.findMany(query, req.user);
  }

  @Public()
  @Get(':idOrSlug')
  findOne(@Param('idOrSlug') idOrSlug: string, @Req() req: Request & { user?: AuthUser }) {
    return this.institutions.findOne(idOrSlug, req.user);
  }

  @PlatformRoles(PlatformRole.PLATFORM_ADMIN, PlatformRole.SUPER_ADMIN)
  @Post()
  create(@Body() dto: CreateInstitutionDto, @CurrentUser() user: AuthUser) {
    return this.institutions.create(dto, user);
  }

  @PlatformRoles(PlatformRole.PLATFORM_ADMIN, PlatformRole.SUPER_ADMIN)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateInstitutionDto) {
    return this.institutions.update(id, dto);
  }

  @PlatformRoles(PlatformRole.PLATFORM_ADMIN, PlatformRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.institutions.softDelete(id);
  }
}
