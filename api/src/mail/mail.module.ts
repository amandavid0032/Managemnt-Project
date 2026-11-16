import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { MailService } from './mail.service';
import { MAIL_PROVIDER, type MailProvider } from './mail.types';
import { ConsoleMailProvider, MemoryMailProvider, SmtpMailProvider } from './providers';

/**
 * Chooses the delivery provider from MAIL_PROVIDER. The environment schema
 * has already rejected unsafe combinations (console or memory in production,
 * smtp without a host), so this factory only has to build what it is told.
 */
@Global()
@Module({
  providers: [
    {
      provide: MAIL_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): MailProvider => {
        const kind = config.get('MAIL_PROVIDER', { infer: true });
        if (kind === 'memory') return new MemoryMailProvider();
        if (kind === 'console') return new ConsoleMailProvider();
        return new SmtpMailProvider({
          host: config.get('SMTP_HOST', { infer: true }) ?? '',
          port: config.get('SMTP_PORT', { infer: true }),
          secure: config.get('SMTP_SECURE', { infer: true }),
          user: config.get('SMTP_USER', { infer: true }),
          password: config.get('SMTP_PASSWORD', { infer: true }),
          from: config.get('MAIL_FROM', { infer: true }),
          requireTls: config.get('NODE_ENV', { infer: true }) === 'production',
        });
      },
    },
    MailService,
  ],
  exports: [MailService, MAIL_PROVIDER],
})
export class MailModule {}
