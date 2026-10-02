import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

export interface MailMessage {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
}

/** Sends transactional e-mail. `enabled` is false when nothing can be delivered. */
export interface Mailer {
  readonly enabled: boolean;
  send(message: MailMessage): Promise<void>;
}

export const MAILER = Symbol('MAILER');

/** Brevo's HTTPS API (works on hosts that block SMTP ports, like Render's free tier). */
class BrevoMailer implements Mailer {
  readonly enabled = true;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: { 'api-key': this.apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: this.from, name: 'FinTrack' },
        to: [{ email: message.to, name: message.toName }],
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
      }),
    });
    if (!response.ok) throw new Error(`Brevo responded ${response.status}`);
  }
}

/** Development only: prints the e-mail so links can be clicked from the terminal. */
class LogMailer implements Mailer {
  readonly enabled = true;
  private readonly logger = new Logger('Mailer');

  async send(message: MailMessage): Promise<void> {
    this.logger.log(`E-mail to ${message.to}: ${message.subject}\n${message.text}`);
  }
}

class DisabledMailer implements Mailer {
  readonly enabled = false;

  async send(): Promise<void> {
    throw new Error('E-mail is not configured');
  }
}

export function mailerFactory(config: ConfigService): Mailer {
  const apiKey = config.get<string>('BREVO_API_KEY');
  const from = config.get<string>('MAIL_FROM');
  if (apiKey && from) return new BrevoMailer(apiKey, from);
  // Never print reset links in production logs.
  if (config.get<string>('NODE_ENV') !== 'production') return new LogMailer();
  return new DisabledMailer();
}
