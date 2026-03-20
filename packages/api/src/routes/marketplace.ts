import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { eq, and, desc, ilike } from 'drizzle-orm';
import { publishToMarketplaceSchema } from '@pajamadot/hive-shared';
import { createDb } from '../db/client.js';
import { marketplaceProducts, marketplaceInstalls } from '../db/schema.js';
import { clerkAuth } from '../lib/auth.js';
import type { Env } from '../types/index.js';

type HonoEnv = { Bindings: Env; Variables: { userId: string } };

const app = new Hono<HonoEnv>();

app.use('/*', clerkAuth);

// Browse marketplace (public)
app.get('/', async (c) => {
  const db = createDb(c.env);
  const search = c.req.query('search');
  const category = c.req.query('category');
  const resourceType = c.req.query('type');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 100);

  const conditions = [eq(marketplaceProducts.status, 'approved')];
  if (search) conditions.push(ilike(marketplaceProducts.name, `%${search}%`));
  if (category) conditions.push(eq(marketplaceProducts.category, category));
  if (resourceType) conditions.push(eq(marketplaceProducts.resourceType, resourceType));

  const result = await db.select().from(marketplaceProducts)
    .where(and(...conditions))
    .orderBy(desc(marketplaceProducts.installCount))
    .limit(limit);

  return c.json({ products: result });
});

// Get product detail
app.get('/:id', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');

  const [product] = await db.select().from(marketplaceProducts)
    .where(eq(marketplaceProducts.id, id));
  if (!product) return c.json({ error: 'Product not found' }, 404);

  return c.json({ product });
});

// Publish to marketplace
app.post('/', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const body = await c.req.json();
  const parsed = publishToMarketplaceSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const workspaceId = body.workspaceId;
  if (!workspaceId) return c.json({ error: 'workspaceId required' }, 400);

  const id = nanoid();
  const now = new Date();

  await db.insert(marketplaceProducts).values({
    id,
    workspaceId,
    ...parsed.data,
    publishedBy: userId,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });

  return c.json({ product: { id, ...parsed.data, status: 'pending' } }, 201);
});

// Install from marketplace
app.post('/:id/install', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const productId = c.req.param('id');
  const body = await c.req.json();
  const workspaceId = body.workspaceId;
  if (!workspaceId) return c.json({ error: 'workspaceId required' }, 400);

  const id = nanoid();
  await db.insert(marketplaceInstalls).values({
    id, productId, workspaceId, installedBy: userId, createdAt: new Date(),
  });

  // Increment install count
  const [product] = await db.select().from(marketplaceProducts).where(eq(marketplaceProducts.id, productId));
  if (product) {
    await db.update(marketplaceProducts)
      .set({ installCount: product.installCount + 1, updatedAt: new Date() })
      .where(eq(marketplaceProducts.id, productId));
  }

  return c.json({ ok: true }, 201);
});

export default app;
