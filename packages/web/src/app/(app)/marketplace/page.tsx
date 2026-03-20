'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Product {
  id: string;
  name: string;
  description: string | null;
  resourceType: string;
  category: string | null;
  installCount: number;
  rating: number | null;
}

export default function MarketplacePage() {
  const { getToken } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    async function load() {
      const token = await getToken();
      if (!token) return;
      try {
        const params = filter ? `type=${filter}` : '';
        const data = await api.browseMarketplace(token, params);
        setProducts(data.products ?? []);
      } catch { /* */ }
      setLoading(false);
    }
    load();
  }, [getToken, filter]);

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Marketplace</h1>
            <p className="text-muted-foreground mt-1">Browse and install community agents, plugins, and workflows</p>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          {['', 'agent', 'plugin', 'workflow', 'prompt'].map((type) => (
            <button key={type} onClick={() => setFilter(type)}
              className={`px-3 py-1 rounded-full text-sm ${
                filter === type ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}>
              {type || 'All'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20 border rounded-lg border-dashed">
            <h3 className="text-lg font-medium mb-2">No products found</h3>
            <p className="text-muted-foreground">Be the first to publish to the marketplace!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((product) => (
              <div key={product.id} className="p-4 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium">{product.name}</h3>
                  <span className="text-xs px-2 py-0.5 bg-muted rounded-full">{product.resourceType}</span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{product.description || 'No description'}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{product.installCount} installs</span>
                  {product.rating && <span>{'★'.repeat(Math.round(product.rating))} {product.rating.toFixed(1)}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
