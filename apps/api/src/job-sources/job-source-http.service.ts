import { BadRequestException, Injectable } from '@nestjs/common';

type ProviderFetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
};

@Injectable()
export class JobSourceHttpService {
  private readonly defaultTimeoutMs = 15_000;
  private readonly defaultMaxBytes = 1_000_000;

  async fetch(url: string, options?: ProviderFetchOptions): Promise<string> {
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    const maxBytes = options?.maxBytes ?? this.defaultMaxBytes;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new BadRequestException('Provider response was not successful.');
      }

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > maxBytes) {
        throw new BadRequestException('Provider response exceeded allowed size.');
      }

      return Buffer.from(buffer).toString('utf-8');
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BadRequestException('Provider request timed out.');
      }
      throw new BadRequestException('Could not fetch HTML from provider.');
    } finally {
      clearTimeout(timeout);
    }
  }
}
