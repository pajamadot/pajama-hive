import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { eq, and, desc, ilike } from 'drizzle-orm';
import { publishToMarketplaceSchema } from '@pajamadot/hive-shared';
import { createDb } from '../db/client.js';
import { marketplaceProducts, marketplaceInstalls, marketplaceReviews } from '../db/schema.js';
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

// ── Reviews ──

// Get reviews for a product
app.get('/:id/reviews', async (c) => {
  const db = createDb(c.env);
  const productId = c.req.param('id');

  const reviews = await db.select().from(marketplaceReviews)
    .where(eq(marketplaceReviews.productId, productId))
    .orderBy(desc(marketplaceReviews.createdAt));

  return c.json({ reviews });
});

// Post a review
app.post('/:id/reviews', async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId');
  const productId = c.req.param('id');
  const body = await c.req.json();

  const rating = body.rating;
  if (!rating || rating < 1 || rating > 5) return c.json({ error: 'rating must be 1-5' }, 400);

  const id = nanoid();
  await db.insert(marketplaceReviews).values({
    id, productId, userId, rating, comment: body.comment ?? null, createdAt: new Date(),
  });

  // Update product average rating
  const allReviews = await db.select().from(marketplaceReviews)
    .where(eq(marketplaceReviews.productId, productId));
  const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;

  await db.update(marketplaceProducts).set({
    rating: Math.round(avgRating * 10) / 10,
    ratingCount: allReviews.length,
    updatedAt: new Date(),
  }).where(eq(marketplaceProducts.id, productId));

  return c.json({ review: { id, rating, comment: body.comment } }, 201);
});

// ── Categories ──

app.get('/categories/list', async (c) => {
  const db = createDb(c.env);

  const products = await db.select().from(marketplaceProducts)
    .where(eq(marketplaceProducts.status, 'approved'));

  const categoryMap = new Map<string, number>();
  for (const p of products) {
    const cat = p.category ?? 'uncategorized';
    categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + 1);
  }

  const categories = [...categoryMap.entries()].map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return c.json({ categories });
});

export default app;
