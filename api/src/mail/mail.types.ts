/** A rendered email, ready for any transport. */
export interface MailMessage {
  to: string;
  subject: string;
  /** Plain text is mandatory: some clients and most screen readers prefer it. */
  text: string;
  html: string;
}

/**
 * The seam between EduHub and whoever delivers its mail.
 *
 * Application code depends on this interface only, so switching from SMTP to
 * a provider's HTTP API later is a new class here and nothing else.
 */
export interface MailProvider {
  readonly name: string;
  send(message: MailMessage): Promise<void>;
}

/** DI token — interfaces do not exist at runtime, so Nest needs a symbol. */
export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');
