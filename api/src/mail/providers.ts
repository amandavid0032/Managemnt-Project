import { Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import type { MailMessage, MailProvider } from './mail.types';

/**
 * Development only. Prints the message — including its link — to the log, so
 * the reset and verification flows can be exercised without a mail server.
 *
 * The environment schema refuses this provider in production: a live reset
 * link in a log stream turns read access to logs into account takeover.
 */
export class ConsoleMailProvider implements MailProvider {
  readonly name = 'console';
  private readonly logger = new Logger('Mail');

  send(message: MailMessage): Promise<void> {
    this.logger.warn(
      `\n──── email (MAIL_PROVIDER=console — not delivered) ────\n` +
        `To:      ${message.to}\n` +
        `Subject: ${message.subject}\n\n` +
        `${message.text}\n` +
        `──────────────────────────────────────────────────────`,
    );
    return Promise.resolve();
  }
}

/**
 * Test only. Keeps messages in memory so the e2e suite can read the token out
 * of the email exactly as a person would, rather than reaching into the
 * database for it — which would skip the part of the flow most likely to
 * break.
 */
export class MemoryMailProvider implements MailProvider {
  readonly name = 'memory';
  readonly outbox: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.outbox.push(message);
    return Promise.resolve();
  }

  clear(): void {
    this.outbox.length = 0;
  }
}

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
  /** Refuse to send without TLS. Always true in production. */
  requireTls: boolean;
}

/**
 * Real delivery over SMTP.
 *
 * SMTP rather than one vendor's HTTP SDK: every mainstream transactional
 * provider exposes an SMTP relay, so the choice of vendor stays a
 * configuration change rather than a code change.
 */
export class SmtpMailProvider implements MailProvider {
  readonly name = 'smtp';
  private readonly transport: Transporter;

  constructor(private readonly settings: SmtpSettings) {
    this.transport = createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      // Refuse to send credentials or tokens in cleartext: if the server does
      // not offer STARTTLS, fail rather than downgrade. Relaxed only outside
      // production, where a local catcher such as Mailpit speaks plain SMTP.
      requireTLS: !settings.secure && settings.requireTls,
      auth: settings.user ? { user: settings.user, pass: settings.password ?? '' } : undefined,
      // A hung SMTP server must not hold requests open indefinitely.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.settings.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}
