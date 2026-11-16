import { createServer, type AddressInfo, type Server, type Socket } from 'node:net';
import { SmtpMailProvider } from './providers';

/**
 * A minimal SMTP server: just enough of RFC 5321 to accept one message.
 *
 * This proves SmtpMailProvider really speaks SMTP over a socket — the path a
 * production provider (SES, Postmark, SendGrid…) uses — without depending on
 * a mail container or an external account in CI.
 */
function startFakeSmtp(): Promise<{ server: Server; port: number; received: string[] }> {
  const received: string[] = [];
  const sockets = new Set<Socket>();

  const server = createServer((socket: Socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    let buffer = '';
    let inData = false;
    let data = '';
    socket.write('220 fake.smtp ESMTP ready\r\n');

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let index: number;
      while ((index = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);

        if (inData) {
          if (line === '.') {
            inData = false;
            received.push(data);
            data = '';
            socket.write('250 2.0.0 queued\r\n');
          } else {
            data += `${line}\n`;
          }
          continue;
        }

        const verb = line.slice(0, 4).toUpperCase();
        if (verb === 'EHLO' || verb === 'HELO') socket.write('250-fake.smtp\r\n250 8BITMIME\r\n');
        else if (verb === 'MAIL' || verb === 'RCPT') socket.write('250 2.1.0 ok\r\n');
        // What a real server without TLS answers. A client that is required
        // to use TLS must give up here rather than carry on in cleartext.
        else if (line.toUpperCase() === 'STARTTLS') socket.write('502 5.5.1 STARTTLS not supported\r\n');
        else if (verb === 'DATA') {
          inData = true;
          socket.write('354 end with <CRLF>.<CRLF>\r\n');
        } else if (verb === 'QUIT') {
          socket.end('221 bye\r\n');
        } else socket.write('250 ok\r\n');
      }
    });
  });

  // close() waits for open connections; a refused client may leave one open.
  const originalClose = server.close.bind(server);
  server.close = ((cb?: (err?: Error) => void) => {
    for (const socket of sockets) socket.destroy();
    return originalClose(cb);
  }) as typeof server.close;

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: (server.address() as AddressInfo).port, received });
    });
  });
}

describe('SmtpMailProvider', () => {
  let server: Server;
  let port: number;
  let received: string[];

  beforeEach(async () => {
    ({ server, port, received } = await startFakeSmtp());
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('delivers a message over SMTP with the configured sender', async () => {
    const provider = new SmtpMailProvider({
      host: '127.0.0.1',
      port,
      secure: false,
      from: 'EduHub <no-reply@eduhub.test>',
      requireTls: false,
    });

    await provider.send({
      to: 'student@example.test',
      subject: 'Reset your EduHub password',
      text: 'plain body',
      html: '<p>html body</p>',
    });

    expect(received).toHaveLength(1);
    const raw = received[0]!;
    expect(raw).toMatch(/^From: EduHub <no-reply@eduhub\.test>$/m);
    expect(raw).toMatch(/^To: student@example\.test$/m);
    expect(raw).toMatch(/^Subject: Reset your EduHub password$/m);
    expect(raw).toContain('plain body');
    expect(raw).toContain('<p>html body</p>');
  });

  it('refuses to send in cleartext when TLS is required and the server offers none', async () => {
    const provider = new SmtpMailProvider({
      host: '127.0.0.1',
      port,
      secure: false,
      from: 'EduHub <no-reply@eduhub.test>',
      requireTls: true,
    });

    await expect(
      provider.send({ to: 'a@example.test', subject: 's', text: 't', html: '<p>h</p>' }),
    ).rejects.toThrow();
    // Nothing — no token, no body — crossed the wire unencrypted.
    expect(received).toHaveLength(0);
  });
});
