import { Injectable } from '@nestjs/common';

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  fetchedAt: number;
};

@Injectable()
export class JobSourceFetchCacheService {
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly ttlMs = 15 * 60 * 1000;

  async fetch<T>(
    providerId: string,
    url: string,
    loader: () => Promise<T>,
  ): Promise<{ value: T; fetchedAt: Date }> {
    const key = this.buildKey(providerId, url);
    const now = Date.now();
    const cached = this.cache.get(key) as CacheEntry<T> | undefined;

    if (cached && cached.expiresAt > now) {
      return {
        value: cached.value,
        fetchedAt: new Date(cached.fetchedAt),
      };
    }

    const value = await loader();

    this.cache.set(key, {
      value,
      expiresAt: now + this.ttlMs,
      fetchedAt: now,
    });

    return {
      value,
      fetchedAt: new Date(now),
    };
  }

  private buildKey(providerId: string, url: string) {
    const daySuffix = new Date().toISOString().slice(0, 10);
    return `${providerId}|${url}|${daySuffix}`;
  }
}
