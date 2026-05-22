import { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { createApiClient } from '../services/api.client.js';
import { useAsync } from '../hooks/useAsync.js';
import type { Product } from '../types/models.js';

export default function ProductsPage() {
  const { token } = useAuth();
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Product[] | null>(null);

  const { state, refetch } = useAsync(
    () => createApiClient(token).get<Product[]>('/products'),
    [token]
  );

  async function handleSearch() {
    if (!search.trim()) return;
    const client = createApiClient(token);
    const results = await client.get<Array<Product & { similarity?: number }>>(
      `/products/search?q=${encodeURIComponent(search)}`
    );
    setSearchResults(results as Product[]);
  }

  const products = state.status === 'success' ? state.data : [];

  return (
    <div className="page">
      <header className="page-header">
        <h1>Products</h1>
        <div className="toolbar">
          <input
            placeholder="Search (pg_trgm similarity)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="button" className="btn-secondary" onClick={() => void handleSearch()}>
            Search
          </button>
          <button type="button" className="btn-ghost" onClick={() => void refetch()}>
            Refresh
          </button>
        </div>
      </header>

      {state.status === 'loading' && <p>Loading products…</p>}
      {state.status === 'error' && <div className="alert error">{state.error}</div>}

      <div className="product-grid">
        {(searchResults ?? products).map((p) => (
          <article key={p.id} className="product-card">
            <span className="sku">{p.sku}</span>
            <h3>{p.name}</h3>
            <p className="price">${p.price}</p>
            <p className="stock">Stock: {p.stock}</p>
            {p.category && <span className="tag">{p.category}</span>}
          </article>
        ))}
      </div>
    </div>
  );
}
