import { createMiddleware } from 'hono/factory';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, config: RateLimitConfig): { allowed: boolean; remaining: number; resetAt: number } {
  maybeCleanup();
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, remaining: config.maxRequests - 1, resetAt: now + config.windowMs };
  }

  if (entry.count >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt };
}

let lastCleanup = 0;
function maybeCleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt) rateLimitStore.delete(key);
  }
}

export function rateLimit(config: RateLimitConfig = { windowMs: 60_000, maxRequests: 60 }) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const userId = c.get('userId') ?? c.req.header('CF-Connecting-IP') ?? 'anonymous';
    const method = c.req.method;
    // Group rate limits: reads share a pool, writes share a separate pool
    const pool = method === 'GET' ? 'read' : 'write';
    const key = `${userId}:${pool}`;

    const result = checkRateLimit(key, config);

    c.header('X-RateLimit-Limit', config.maxRequests.toString());
    c.header('X-RateLimit-Remaining', result.remaining.toString());
    c.header('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000).toString());

    if (!result.allowed) {
      return c.json({
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
      }, 429);
    }

    await next();
  });
}

/** Strict: 10 writes/min (run creation, approvals, mutations) */
export const strictRateLimit = rateLimit({ windowMs: 60_000, maxRequests: 10 });

/** Standard: 120 reads + 30 writes/min */
export const standardRateLimit = rateLimit({ windowMs: 60_000, maxRequests: 120 });

/** Write: 30 writes/min for standard mutation endpoints */
export const writeRateLimit = rateLimit({ windowMs: 60_000, maxRequests: 30 });
