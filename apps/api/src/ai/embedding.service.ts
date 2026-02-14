import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type OpenAIEmbeddingResponse = {
  data?: Array<{
    embedding?: number[];
  }>;
};

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly model: string;
  private readonly endpoint: string;
  private readonly apiKey: string | null;

  constructor(private readonly configService: ConfigService) {
    this.model =
      this.configService.get<string>('AI_EMBEDDING_MODEL') ??
      'text-embedding-3-small';
    this.endpoint =
      this.configService.get<string>('OPENAI_API_BASE_URL') ??
      'https://api.openai.com/v1/embeddings';
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY') ?? null;

    if (!this.apiKey) {
      this.logger.warn(
        'OPENAI_API_KEY is not set; embedding requests are disabled.',
      );
    }
  }

  async embed(text: string): Promise<number[] | null> {
    const normalized = this.normalizeText(text);
    if (!normalized || !this.apiKey) {
      return null;
    }

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: normalized,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
      this.logger.warn(
        `Embedding request failed status=${response.status} body=${body}`,
      );
        return null;
      }

      const payload = (await response.json()) as OpenAIEmbeddingResponse;
      const embedding = payload.data?.[0]?.embedding;

      if (!Array.isArray(embedding)) {
        this.logger.warn('Embedding response did not include a vector');
        return null;
      }

      if (embedding.length !== 1536) {
        this.logger.warn(
          `Received embedding of length ${embedding.length}, expected 1536.`,
        );
      }

      return embedding;
    } catch (error) {
      this.logger.warn(
        'Embedding request failed',
        this.describeError(error),
      );
      return null;
    }
  }

  private normalizeText(input: string): string {
    return input
      .replace(/\s+/g, ' ')
      .trim();
  }

  private describeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
