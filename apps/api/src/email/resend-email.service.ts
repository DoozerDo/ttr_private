import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ResendEmailInput {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
}

@Injectable()
export class ResendEmailService {
  private readonly logger = new Logger(ResendEmailService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendEmail(input: ResendEmailInput): Promise<void> {
    const apiKey =
      this.configService.get<string>('RESEND_API_KEY')?.trim() ??
      process.env.RESEND_API_KEY?.trim() ??
      '';
    const from =
      this.configService.get<string>('MAIL_FROM')?.trim() ??
      process.env.MAIL_FROM?.trim() ??
      '';
    const isProduction = this.isProduction();
    const fallbackUrl = this.extractFirstUrl(input.html ?? input.text ?? '');

    if (!apiKey || !from) {
      if (!isProduction) {
        this.logger.warn(
          JSON.stringify({
            event: 'email_delivery_skipped',
            reason: !apiKey ? 'missing_resend_api_key' : 'missing_mail_from',
            to: input.to,
            subject: input.subject,
            url: fallbackUrl,
          }),
        );
        return;
      }

      if (!apiKey) {
        throw new Error(
          'Missing RESEND_API_KEY environment variable for Resend email delivery.',
        );
      }

      throw new Error('Missing MAIL_FROM environment variable for Resend email delivery.');
    }

    if (!input.html && !input.text) {
      throw new Error('Resend email payload must include html or text content.');
    }

    const replyTo =
      input.replyTo ??
      this.configService.get<string>('MAIL_REPLY_TO') ??
      process.env.MAIL_REPLY_TO ??
      'support@targetthisrole.com';

    const payload: Record<string, unknown> = {
      from,
      to: input.to,
      subject: input.subject,
    };

    if (input.html) {
      payload.html = input.html;
    }

    if (input.text) {
      payload.text = input.text;
    }

    if (replyTo) {
      payload.reply_to = replyTo;
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Resend request failed with status ${response.status}: ${errorBody || 'No response body.'}`,
        );
      }

      this.logger.log(`Resend email sent to ${input.to} subject="${input.subject}"`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!isProduction) {
        this.logger.warn(
          JSON.stringify({
            event: 'email_delivery_fallback',
            to: input.to,
            subject: input.subject,
            reason: message,
            url: fallbackUrl,
          }),
        );
        return;
      }
      this.logger.error(
        `Failed to send Resend email to ${input.to} subject="${input.subject}": ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private extractFirstUrl(content: string): string | null {
    const match = content.match(/https?:\/\/[^\s"'<>]+/i);
    return match?.[0] ?? null;
  }

  private isProduction(): boolean {
    return (
      (this.configService.get<string>('NODE_ENV') ?? process.env.NODE_ENV ?? '').trim() ===
      'production'
    );
  }
}
