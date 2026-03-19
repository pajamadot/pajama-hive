import { createMiddleware } from 'hono/factory';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

/**
 * Max payload size enforcement.
 * Prevents oversized requests from consuming resources.
 */
export function maxPayloadSize(maxBytes: number = 1_048_576) { // 1MB default
  return createMiddleware<HonoEnv>(async (c, next) => {
    const contentLength = c.req.header('Content-Length');
    if (contentLength && parseInt(contentLength) > maxBytes) {
      return c.json({
        error: 'Payload too large',
        maxBytes,
      }, 413);
    }
    await next();
  });
}

/**
 * Request ID middleware — adds a unique ID to every request for tracing.
 */
export function requestId() {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const id = c.req.header('X-Request-ID') ?? crypto.randomUUID();
    c.header('X-Request-ID', id);
    await next();
  });
}

/**
 * Security headers middleware.
 */
export function securityHeaders() {
  return createMiddleware<HonoEnv>(async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  });
}
