import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/tenant.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { UpdateProfileDto, UpdateVisibilityDto } from './dto/update-profile.dto';
import { ProfilesService } from './profiles.service';

/**
 * There is no :userId on any write route. "My profile" is always the
 * authenticated caller — the id comes from the verified token, so there is
 * nothing for a client to tamper with to edit someone else's.
 */
@Controller({ path: 'profiles', version: '1' })
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  // The literal 'me' routes are declared before ':userId' so they are not
  // swallowed as an id.

  @Get('me')
  getMine(@CurrentUser() user: AuthUser) {
    return this.profiles.getMine(user.id);
  }

  @Patch('me')
  updateMine(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.profiles.updateMine(user.id, dto);
  }

  @Patch('me/visibility')
  setVisibility(@CurrentUser() user: AuthUser, @Body() dto: UpdateVisibilityDto) {
    return this.profiles.setVisibility(user.id, dto.visibility);
  }

  /**
   * Public, with OPTIONAL authentication (see JwtAuthGuard): an anonymous
   * visitor sees PUBLIC profiles, a signed-in user also sees MEMBERS ones.
   */
  @Public()
  @Get(':userId')
  getPublic(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.profiles.getPublic(userId, req.user);
  }
}
