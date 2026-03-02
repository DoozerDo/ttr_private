import { Injectable, Logger } from '@nestjs/common';

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

  async sendEmail(input: ResendEmailInput): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.MAIL_FROM;

    if (!apiKey) {
      throw new Error(
        'Missing RESEND_API_KEY environment variable for Resend email delivery.',
      );
    }

    if (!from) {
      throw new Error(
        'Missing MAIL_FROM environment variable for Resend email delivery.',
      );
    }

    if (!input.html && !input.text) {
      throw new Error('Resend email payload must include html or text content.');
    }

    const replyTo =
      input.replyTo ?? process.env.MAIL_REPLY_TO ?? 'support@targetthisrole.ai';

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
      this.logger.error(
        `Failed to send Resend email to ${input.to} subject="${input.subject}": ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }
}
