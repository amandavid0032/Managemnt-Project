import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { MAIL_PROVIDER, type MailMessage, type MailProvider } from './mail.types';

/** Names are user-supplied; never let one inject markup into an email. */
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const layout = (heading: string, body: string): string => `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">
    <p style="margin:0 0 16px;font-size:20px;font-weight:bold;color:#1e40af">EduHub</p>
    <h1 style="margin:0 0 12px;font-size:18px">${heading}</h1>
    ${body}
  </div>
</body></html>`;

const button = (href: string, label: string): string =>
  `<p style="margin:24px 0"><a href="${href}" style="background:#1d4ed8;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">${label}</a></p>
   <p style="font-size:12px;color:#6b7280">If the button does not work, copy this address into your browser:<br>${href}</p>`;

/**
 * Builds EduHub's transactional emails and hands them to the configured
 * provider.
 *
 * Sending is fire-and-forget from the caller's point of view. That is a
 * security property, not just a latency one: if "forgot password" awaited
 * the SMTP round-trip only when the address exists, response time alone
 * would reveal which addresses are registered.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly appUrl: string;

  constructor(
    @Inject(MAIL_PROVIDER) private readonly provider: MailProvider,
    config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get('APP_URL', { infer: true }).replace(/\/+$/, '');
  }

  /**
   * Tokens travel in the URL FRAGMENT (#token=…), not the query string.
   * Browsers never send the fragment to any server and never include it in
   * a Referer header, so the token cannot leak into access logs or to
   * third-party resources on the landing page.
   */
  link(path: string, token: string): string {
    return `${this.appUrl}${path}#token=${encodeURIComponent(token)}`;
  }

  sendEmailVerification(to: string, fullName: string, token: string, ttlHours: number): void {
    const url = this.link('/verify-email', token);
    this.dispatch({
      to,
      subject: 'Confirm your EduHub email address',
      text:
        `Hi ${fullName},\n\n` +
        `Confirm that this is your email address by opening the link below:\n\n${url}\n\n` +
        `The link works once and expires in ${ttlHours} hours.\n` +
        `If you did not create an EduHub account, you can ignore this email.`,
      html: layout(
        'Confirm your email address',
        `<p>Hi ${escapeHtml(fullName)},</p>
         <p>Confirm that this is your email address.</p>
         ${button(url, 'Confirm email address')}
         <p style="font-size:13px;color:#4b5563">The link works once and expires in ${ttlHours} hours. If you did not create an EduHub account, you can ignore this email.</p>`,
      ),
    });
  }

  sendPasswordReset(to: string, fullName: string, token: string, ttlMinutes: number): void {
    const url = this.link('/reset-password', token);
    this.dispatch({
      to,
      subject: 'Reset your EduHub password',
      text:
        `Hi ${fullName},\n\n` +
        `Someone asked to reset the password for this EduHub account. To choose a new password, open:\n\n${url}\n\n` +
        `The link works once and expires in ${ttlMinutes} minutes.\n` +
        `If this was not you, ignore this email — your password stays the same.`,
      html: layout(
        'Reset your password',
        `<p>Hi ${escapeHtml(fullName)},</p>
         <p>Someone asked to reset the password for this EduHub account.</p>
         ${button(url, 'Choose a new password')}
         <p style="font-size:13px;color:#4b5563">The link works once and expires in ${ttlMinutes} minutes. If this was not you, ignore this email — your password stays the same.</p>`,
      ),
    });
  }

  /**
   * Sent after every successful reset. If the owner did not do it, this is
   * how they find out their account was taken over.
   */
  sendPasswordChanged(to: string, fullName: string): void {
    this.dispatch({
      to,
      subject: 'Your EduHub password was changed',
      text:
        `Hi ${fullName},\n\n` +
        `The password for your EduHub account was just changed, and every device was signed out.\n` +
        `If this was not you, reset your password immediately at ${this.appUrl}/forgot-password and contact support.`,
      html: layout(
        'Your password was changed',
        `<p>Hi ${escapeHtml(fullName)},</p>
         <p>The password for your EduHub account was just changed, and every device was signed out.</p>
         <p>If this was not you, <a href="${this.appUrl}/forgot-password">reset your password immediately</a> and contact support.</p>`,
      ),
    });
  }

  private dispatch(message: MailMessage): void {
    this.provider.send(message).catch((error: unknown) => {
      // The recipient address is logged; the body (which carries the token)
      // never is.
      this.logger.error(
        `Email delivery failed via ${this.provider.name} to ${message.to}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }
}
