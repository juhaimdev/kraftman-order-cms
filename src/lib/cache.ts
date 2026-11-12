import "server-only";

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

type GlobalWithCache = typeof globalThis & {
  __vercelMemoryCache?: Map<string, CacheEntry>;
};

const MAX_CACHE_ENTRIES = 500;

function getMemoryStore(): Map<string, CacheEntry> {
  const g = globalThis as GlobalWithCache;
  if (!g.__vercelMemoryCache) {
    g.__vercelMemoryCache = new Map<string, CacheEntry>();
  }
  return g.__vercelMemoryCache;
}

/**
 * Warm-instance TTL cache optimized for Vercel Node.js serverless functions.
 * Keeps PIN-code lookups, tracking responses, and OAuth tokens in memory
 * across warm invocations with zero external Redis/KV roundtrip overhead.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const store = getMemoryStore();
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return null;
  }
  return hit.value as T;
}

export async function cachePut(
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<void> {
  const store = getMemoryStore();
  if (store.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = store.keys().next().value;
    if (oldestKey) store.delete(oldestKey);
  }
  store.set(key, {
    value,
    expiresAt: Date.now() + Math.max(1, ttlSeconds) * 1000,
  });
}

export async function cached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number
): Promise<{ value: T; cacheHit: boolean }> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) {
    return { value: hit, cacheHit: true };
  }
  const fresh = await fetcher();
  await cachePut(key, fresh, ttlSeconds);
  return { value: fresh, cacheHit: false };
}

// Legacy aliases preserved for clean imports
export const kvGet = cacheGet;
export const kvPut = cachePut;
