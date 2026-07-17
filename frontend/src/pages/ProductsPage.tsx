import { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { createApiClient } from '../services/api.client.js';
import { useAsync } from '../hooks/useAsync.js';
import type { Product } from '../types/models.js';

interface PaginatedProducts {
  items: Product[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const emptyForm = {
  sku: '',
  name: '',
  description: '',
  price: '0',
  stock: '0',
  category: '',
};

export default function ProductsPage() {
  const { token, can, user } = useAuth();
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Product[] | null>(null);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const canManage = user?.role === 'admin' || user?.role === 'manager';

  const { state, refetch } = useAsync(
    () => createApiClient(token).get<PaginatedProducts>(`/products?page=${page}&limit=12`),
    [token, page]
  );

  async function handleSearch() {
    if (!search.trim()) {
      setSearchResults(null);
      return;
    }
    const client = createApiClient(token);
    const results = await client.get<Product[]>(`/products/search?q=${encodeURIComponent(search)}`);
    setSearchResults(results);
  }

  async function saveProduct() {
    setMsg('');
    const client = createApiClient(token);
    const body = {
      sku: form.sku,
      name: form.name,
      description: form.description || null,
      price: Number(form.price),
      stock: Number(form.stock),
      category: form.category || null,
    };
    try {
      if (editingId) {
        const { sku: _sku, ...patch } = body;
        const expectedVersion =
          products.find((p) => p.id === editingId)?.version ?? undefined;
        await client.patch(`/products/${editingId}`, { ...patch, expectedVersion });
        setMsg('Product updated');
      } else {
        await client.post('/products', body);
        setMsg('Product created');
      }
      setForm(emptyForm);
      setEditingId(null);
      setSearchResults(null);
      await refetch();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed');
    }
  }

  async function deleteProduct(id: string) {
    if (!confirm('Delete this product?')) return;
    try {
      await createApiClient(token).delete(`/products/${id}`);
      setMsg('Product deleted');
      await refetch();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  const pageData = state.status === 'success' ? state.data : null;
  const products = useMemo(
    () => searchResults ?? pageData?.items ?? [],
    [searchResults, pageData]
  );

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
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setSearchResults(null);
              void refetch();
            }}
          >
            Refresh
          </button>
        </div>
      </header>

      {msg && <div className="alert">{msg}</div>}
      {state.status === 'loading' && <p>Loading products…</p>}
      {state.status === 'error' && <div className="alert error">{state.error}</div>}

      {canManage && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3>{editingId ? 'Edit product' : 'Add product'}</h3>
          <div className="toolbar" style={{ flexWrap: 'wrap' }}>
            {!editingId && (
              <input
                placeholder="SKU"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
              />
            )}
            <input
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              placeholder="Price"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
            <input
              placeholder="Stock"
              value={form.stock}
              onChange={(e) => setForm({ ...form, stock: e.target.value })}
            />
            <input
              placeholder="Category"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
            <button type="button" className="btn-primary" onClick={() => void saveProduct()}>
              {editingId ? 'Update' : 'Create'}
            </button>
            {editingId && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyForm);
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      <div className="product-grid">
        {products.map((p) => (
          <article key={p.id} className="product-card">
            <span className="sku">{p.sku}</span>
            <h3>{p.name}</h3>
            <p className="price">${p.price}</p>
            <p className="stock">Stock: {p.stock}</p>
            {p.category && <span className="tag">{p.category}</span>}
            {canManage && (
              <div className="toolbar" style={{ marginTop: '0.75rem' }}>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setEditingId(p.id);
                    setForm({
                      sku: p.sku,
                      name: p.name,
                      description: p.description ?? '',
                      price: String(p.price),
                      stock: String(p.stock),
                      category: p.category ?? '',
                    });
                  }}
                >
                  Edit
                </button>
                {can('system') && (
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => void deleteProduct(p.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </article>
        ))}
      </div>

      {!searchResults && pageData && (
        <div className="toolbar" style={{ marginTop: '1rem' }}>
          <button
            type="button"
            className="btn-ghost"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>
          <span className="muted">
            Page {pageData.page} / {pageData.totalPages} ({pageData.total} items)
          </span>
          <button
            type="button"
            className="btn-ghost"
            disabled={page >= pageData.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
