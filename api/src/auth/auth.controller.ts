import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/tenant.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthUser } from '../common/types/auth-user';
import type { Env } from '../config/env.schema';
import { AuthService } from './auth.service';
import { ForgotPasswordDto, ResetPasswordDto, VerifyEmailDto } from './dto/email-flows.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import type { IssuedTokens } from './token.service';

const REFRESH_COOKIE = 'eduhub_refresh';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * httpOnly so JavaScript cannot read it — an XSS payload cannot exfiltrate
   * the refresh token. Secure in production; SameSite=Lax blocks CSRF from
   * cross-site form posts. Path is scoped so it is only sent to /auth.
   */
  private cookieOptions(expires: Date): CookieOptions {
    const isProd = this.config.get('NODE_ENV', { infer: true }) === 'production';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      expires,
      path: '/api/v1/auth',
    };
  }

  private setRefreshCookie(res: Response, tokens: IssuedTokens): void {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, this.cookieOptions(tokens.refreshExpiresAt));
  }

  private static client(req: Request) {
    return { userAgent: req.get('user-agent') ?? undefined, ipAddress: req.ip };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.auth.register(dto, AuthController.client(req));
  }

  // ---------------------------------------------------------------------------
  // Password reset. Both routes are public: the person has, by definition,
  // lost the means to authenticate.
  // ---------------------------------------------------------------------------

  /** Identical response whether or not the address is registered. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('password/forgot')
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    return this.auth.requestPasswordReset(dto.email, req.ip);
  }

  /**
   * Also clears this browser's refresh cookie: every session was just revoked
   * server-side, and a dead cookie left behind would only produce a confusing
   * failed refresh on the next page load.
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('password/reset')
  async resetPassword(@Body() dto: ResetPasswordDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.resetPassword(dto.token, dto.password);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    return result;
  }

  // ---------------------------------------------------------------------------
  // Email verification
  // ---------------------------------------------------------------------------

  /** Public: the link may be opened on a device where the person is not signed in. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('email/verify')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto.token);
  }

  /** Authenticated: you can only ask for a link to your own address. */
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('email/resend')
  resendVerification(@CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.auth.resendVerification(user.id, req.ip);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) // brute-force mitigation
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.auth.login(dto, AuthController.client(req));
    this.setRefreshCookie(res, tokens);
    return { user, accessToken: tokens.accessToken };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!raw) throw new UnauthorizedException('No refresh token provided');

    const tokens = await this.auth.refresh(raw, AuthController.client(req));
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken };
  }

  /**
   * Deliberately @Public: logging out must work when the access token has
   * already expired. Authority comes from possession of the refresh cookie,
   * and revoking a token is not a privileged act.
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    const result = await this.auth.logout(raw);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    return result;
  }

  /**
   * Ends every session on every device. NOT public — this affects sessions the
   * caller is not currently holding, so it requires a valid access token to
   * prove it is the account owner and not someone with a stolen cookie.
   */
  @HttpCode(HttpStatus.OK)
  @Post('logout-all')
  async logoutAll(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.logoutAll(user.id);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    return result;
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}
