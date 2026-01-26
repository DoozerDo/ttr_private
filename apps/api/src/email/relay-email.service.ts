import { Injectable } from '@nestjs/common';

interface RelayEmailInput {
  to: string;
  subject: string;
  body: string;
  type?: string;
  replyTo?: string;
}

@Injectable()
export class RelayEmailService {
  async sendRawRelayEmail(input: RelayEmailInput): Promise<void> {
    const relayUrl = process.env.RELAY_URL;
    const apiToken = process.env.API_TOKEN;

    if (!relayUrl) {
      throw new Error(
        'Missing RELAY_URL environment variable for email relay.',
      );
    }

    if (!apiToken) {
      throw new Error(
        'Missing API_TOKEN environment variable for email relay.',
      );
    }

    const replyTo =
      input.replyTo ?? process.env.MAIL_REPLY_TO ?? 'support@targetthisrole.ai';

    const response = await fetch(relayUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: input.to,
        subject: input.subject,
        replyTo,
        body: input.body,
        type: input.type,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Relay request failed with status ${response.status}: ${errorText || 'No response body.'}`,
      );
    }
  }
}
