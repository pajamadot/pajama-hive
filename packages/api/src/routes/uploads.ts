import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { clerkAuth } from '../lib/auth.js';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<HonoEnv>();

app.use('/*', clerkAuth);

// Upload file to R2
app.post('/', async (c) => {
  const contentType = c.req.header('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    // Multipart upload
    const formData = await c.req.formData();
    const raw = formData.get('file');
    if (!raw || typeof raw === 'string') {
      return c.json({ error: 'No file provided' }, 400);
    }

    const file = raw as unknown as { name: string; size: number; type: string; arrayBuffer(): Promise<ArrayBuffer> };
    const key = `${nanoid()}/${file.name}`;
    const buffer = await file.arrayBuffer();

    await c.env.UPLOADS_BUCKET.put(key, buffer, {
      httpMetadata: { contentType: file.type },
      customMetadata: {
        originalName: file.name,
        uploadedBy: c.get('userId'),
        uploadedAt: new Date().toISOString(),
      },
    });

    return c.json({
      upload: {
        key,
        name: file.name,
        size: file.size,
        contentType: file.type,
      },
    }, 201);
  }

  // JSON body with base64 content
  const body = await c.req.json();
  const { name, content, contentType: ct } = body;
  if (!name || !content) return c.json({ error: 'name and content required' }, 400);

  const key = `${nanoid()}/${name}`;
  const buffer = Uint8Array.from(atob(content), (c) => c.charCodeAt(0));

  await c.env.UPLOADS_BUCKET.put(key, buffer, {
    httpMetadata: { contentType: ct ?? 'application/octet-stream' },
    customMetadata: {
      originalName: name,
      uploadedBy: c.get('userId'),
      uploadedAt: new Date().toISOString(),
    },
  });

  return c.json({
    upload: { key, name, size: buffer.length, contentType: ct },
  }, 201);
});

// Get file from R2
app.get('/:key{.+}', async (c) => {
  const key = c.req.param('key');
  const object = await c.env.UPLOADS_BUCKET.get(key);
  if (!object) return c.json({ error: 'File not found' }, 404);

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType ?? 'application/octet-stream');
  headers.set('Content-Length', String(object.size));
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');

  return new Response(object.body, { headers });
});

// Delete file from R2
app.delete('/:key{.+}', async (c) => {
  const key = c.req.param('key');
  await c.env.UPLOADS_BUCKET.delete(key);
  return c.json({ ok: true });
});

// List files (prefix-based)
app.get('/', async (c) => {
  const prefix = c.req.query('prefix') ?? '';
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 200);

  const result = await c.env.UPLOADS_BUCKET.list({ prefix, limit });

  return c.json({
    files: result.objects.map((obj) => ({
      key: obj.key,
      size: obj.size,
      uploaded: obj.uploaded,
      etag: obj.etag,
    })),
    truncated: result.truncated,
  });
});

// Generate a time-limited download token
app.post('/sign', async (c) => {
  const body = await c.req.json();
  const key = body.key;
  if (!key) return c.json({ error: 'key required' }, 400);

  const expiresIn = body.expiresIn ?? 3600; // default 1 hour
  const expiresAt = Date.now() + expiresIn * 1000;

  // Simple HMAC-based signed URL (since R2 Workers doesn't support native presigned URLs)
  const encoder = new TextEncoder();
  const data = encoder.encode(`${key}:${expiresAt}`);
  const hmacKey = await crypto.subtle.importKey(
    'raw', encoder.encode(c.env.CLERK_SECRET_KEY),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', hmacKey, data);
  const token = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '');

  return c.json({
    url: `https://hive-api.pajamadot.com/v1/uploads/download?key=${encodeURIComponent(key)}&expires=${expiresAt}&token=${token}`,
    expiresAt: new Date(expiresAt).toISOString(),
  });
});

// Serve file via signed token (no auth required)
app.get('/download', async (c) => {
  const key = c.req.query('key');
  const expires = c.req.query('expires');
  const token = c.req.query('token');

  if (!key || !expires || !token) return c.json({ error: 'Missing parameters' }, 400);

  const expiresAt = parseInt(expires, 10);
  if (Date.now() > expiresAt) return c.json({ error: 'Link expired' }, 403);

  // Verify HMAC signature
  const encoder = new TextEncoder();
  const data = encoder.encode(`${key}:${expiresAt}`);
  const hmacKey = await crypto.subtle.importKey(
    'raw', encoder.encode(c.env.CLERK_SECRET_KEY),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
  );
  const sigBytes = Uint8Array.from(atob(token), (c) => c.charCodeAt(0));
  const valid = await crypto.subtle.verify('HMAC', hmacKey, sigBytes, data);
  if (!valid) return c.json({ error: 'Invalid signature' }, 403);

  const object = await c.env.UPLOADS_BUCKET.get(key);
  if (!object) return c.json({ error: 'File not found' }, 404);

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'Content-Length': String(object.size),
      'Cache-Control': 'private, max-age=3600',
    },
  });
});

export default app;
