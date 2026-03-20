/**
 * CacheAdapter — pluggable caching interface.
 * Default: Cloudflare KV
 * Swappable to: Redis, Memcached, Upstash
 */

export interface CacheOptions {
  /** TTL in seconds */
  ttl?: number;
  /** Cache tags for invalidation */
  tags?: string[];
}

export interface CacheAdapter {
  /** Get a cached value */
  get<T = unknown>(key: string): Promise<T | null>;

  /** Set a cached value */
  set<T>(key: string, value: T, options?: CacheOptions): Promise<void>;

  /** Delete a cached value */
  delete(key: string): Promise<void>;

  /** Check if key exists */
  has(key: string): Promise<boolean>;

  /** Delete all keys matching a prefix */
  deleteByPrefix(prefix: string): Promise<void>;

  /** Delete all keys with a specific tag */
  deleteByTag(tag: string): Promise<void>;
}

/**
 * Default implementation using Cloudflare KV.
 * KV namespace bindings configured in wrangler.toml.
 */
export class KVCacheAdapter implements CacheAdapter {
  constructor(private readonly kv: KVNamespace) {}

  async get<T = unknown>(key: string): Promise<T | null> {
    const value = await this.kv.get(key, 'json');
    return value as T | null;
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    await this.kv.put(key, JSON.stringify(value), {
      expirationTtl: options?.ttl,
    });
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
  }

  async has(key: string): Promise<boolean> {
    const value = await this.kv.get(key);
    return value !== null;
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    const list = await this.kv.list({ prefix });
    await Promise.all(list.keys.map((k) => this.kv.delete(k.name)));
  }

  async deleteByTag(_tag: string): Promise<void> {
    // KV doesn't support tags natively — would need a tag index
    // For production, consider upgrading to Redis adapter
  }
}

/**
 * In-memory cache for development/testing.
 */
export class MemoryCacheAdapter implements CacheAdapter {
  private store = new Map<string, { value: unknown; expiresAt?: number }>();

  async get<T = unknown>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: options?.ttl ? Date.now() + options.ttl * 1000 : undefined,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  async deleteByTag(_tag: string): Promise<void> {
    // No tag support in memory cache
  }
}
